import { BrowserWindow, globalShortcut, app, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { stopHeartbeat, writeQuitFlag } from '../services/reliability/watchdog'
import { closeEmbeddedBrowser } from '../services/browser/embeddedBrowser'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'
import {
  restoreHomeRecoveryGiveUp,
  writeHomeRecoveryGiveUp
} from '../services/reliability/homeRecoveryRecord'
import {
  decideHomeRecovery,
  INITIAL_HOME_RECOVERY_STATE,
  HOME_UNRESPONSIVE_GRACE_MS,
  type HomeRecoveryEvent
} from '../services/reliability/homeRecovery'

/**
 * Kiosk lockdown, ported conceptually from the old app's windows.js. Real
 * fullscreen/always-on-top/escape-shortcut-swallowing only applies when NOT
 * running under `npm run dev` - locking a dev machine's real desktop into
 * kiosk mode with no way to Alt+Tab out is a genuine risk to whoever is
 * sitting at the keyboard testing it, not just the eventual kiosk deployment.
 * `Ctrl+Shift+Q` always remains as an escape hatch regardless of mode.
 */
const KIOSK_ENABLED = !is.dev
/** How long a hang recovery waits for Chromium to report its forced kill before reloading anyway. */
const FORCED_KILL_REPORT_TIMEOUT_MS = 5_000
/** After that backstop, a kill report arriving this late is still the same recovery, not a new crash. */
const LATE_KILL_REPORT_MS = 30_000

/**
 * A full e2e run launches the app about 35 times, and each window used to pop
 * up on the developer's screen and take focus mid-typing. Under
 * GRAMMIEGUIDE_E2E the windows open where they normally would, but fully
 * transparent, click-through, unfocused and out of the taskbar, so the
 * developer sees nothing and keeps typing into their own window. Playwright
 * drives pages through the DevTools protocol with focus emulation, so nothing
 * needs the real focus or mouse; native occlusion detection is already off in
 * this mode (index.ts), so an invisible window still paints and resizes.
 *
 * Moving them off-screen instead broke the kiosk-size tests: a window beyond
 * every display has no monitor to take its scaling from, and even one tucked
 * into a screen corner came out a few pixels off after setContentSize().
 */
export const QUIET_E2E_WINDOWS = process.env['GRAMMIEGUIDE_E2E'] === '1'

function quietWindowOptions(): Partial<BrowserWindowConstructorOptions> {
  return QUIET_E2E_WINDOWS ? { skipTaskbar: true, opacity: 0 } : {}
}

/** Shows a window the way it should appear: taking focus normally, never under e2e. */
function showWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  if (!QUIET_E2E_WINDOWS) return win.show()
  // The OS mouse passes through to whatever is underneath; Playwright's
  // clicks arrive through DevTools and are unaffected.
  win.setIgnoreMouseEvents(true)
  win.showInactive()
}

/**
 * Puts kiosk Home above other windows, or lets it step down. Electron's default
 * always-on-top level on Windows ("floating") files the window just behind the
 * taskbar, and Windows 11 takes the taskbar's own topmost flag away while a
 * fullscreen window is in front, so Home lost always on top most of the time
 * (7 tries in 8 on her laptop). The screen-saver level skips that step and holds.
 */
export function setHomeOnTop(win: BrowserWindow, onTop: boolean): void {
  win.setAlwaysOnTop(onTop, 'screen-saver')
}

let launcherWindow: BrowserWindow | null = null
let adminWindow: BrowserWindow | null = null
export function getAdminWindow(): BrowserWindow | null {
  return adminWindow
}

export function createLauncherWindow(): BrowserWindow {
  launcherWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    ...quietWindowOptions(),
    show: false,
    fullscreen: KIOSK_ENABLED,
    autoHideMenuBar: true,
    webPreferences: {
      // CommonJS on purpose: a sandboxed preload can't load an ES module.
      preload: join(__dirname, '../preload/launcher.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Not the alwaysOnTop constructor option: it uses the default level (see setHomeOnTop).
  if (KIOSK_ENABLED) setHomeOnTop(launcherWindow, true)
  launcherWindow.on('ready-to-show', () => showWindow(launcherWindow))
  launcherWindow.setMenuBarVisibility(false)
  installHomeRecovery(launcherWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    launcherWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/launcher/index.html`)
  } else {
    launcherWindow.loadFile(join(__dirname, '../renderer/launcher/index.html'))
  }

  registerGlobalShortcuts()
  return launcherWindow
}

function installHomeRecovery(win: BrowserWindow): void {
  const userDataDir = app.getPath('userData')
  restoreHomeRecoveryGiveUp(userDataDir)
  let state = INITIAL_HOME_RECOVERY_STATE
  let hangTimer: NodeJS.Timeout | null = null
  let killReportTimer: NodeJS.Timeout | null = null
  let shuttingDown = false
  let expectingForcedCrash = false
  let lateKillReportUntil = 0

  const cancelHangTimer = (): void => {
    if (hangTimer) clearTimeout(hangTimer)
    hangTimer = null
  }
  const cancelKillReportTimer = (): void => {
    if (killReportTimer) clearTimeout(killReportTimer)
    killReportTimer = null
  }
  const stopRecovery = (): void => {
    shuttingDown = true
    cancelHangTimer()
    cancelKillReportTimer()
  }
  const giveUp = (detail: string): void => {
    stopRecovery()
    logReliabilityEvent({ op: 'home-recovery-gave-up', ok: false, detail })
    // No quit flag or immediate relaunch: the stale heartbeat gives the watchdog its back-off.
    // Exit cannot be held up by an unresponsive renderer's unload handler.
    stopHeartbeat()
    writeHomeRecoveryGiveUp(userDataDir, detail)
    app.exit(1)
  }
  const reloadHome = (problem: string): void => {
    if (shuttingDown || win.isDestroyed() || win.webContents.isDestroyed()) return
    try {
      win.webContents.reload()
    } catch (err) {
      giveUp(`reload failed; ${problem}; ${String(err)}`)
    }
  }

  const handleRecovery = (event: HomeRecoveryEvent, reason?: string): void => {
    if (shuttingDown || win.isDestroyed() || win.webContents.isDestroyed()) return
    cancelHangTimer()
    // A monotonic clock keeps wall-clock corrections from extending a hang or the retry window.
    const now = performance.now()
    const decision = decideHomeRecovery(state, event, now)
    state = decision.state
    const problem =
      event === 'crashed' ? `renderer gone: ${reason}` : 'unresponsive after grace period'

    if (decision.action === 'give-up') {
      giveUp(`recovery limit reached; ${problem}`)
      return
    }
    if (decision.action === 'reload') {
      logReliabilityEvent({
        op: event === 'crashed' ? 'home-renderer-gone' : 'home-unresponsive',
        ok: true,
        detail: `reloading Home; ${problem}`
      })
      try {
        // A leftover WebContentsView would cover fresh Home, which has forgotten its Home button.
        closeEmbeddedBrowser()
        if (event === 'check') {
          // Electron emits render-process-gone for this kill too; it is the same recovery attempt.
          expectingForcedCrash = true
          win.webContents.forcefullyCrashRenderer()
          // On Windows, reloading before the kill is reported can leave Home crashed.
          // But if the report never comes, reload anyway rather than leave her a dead screen.
          killReportTimer = setTimeout(() => {
            killReportTimer = null
            if (!expectingForcedCrash) return
            expectingForcedCrash = false
            lateKillReportUntil = performance.now() + LATE_KILL_REPORT_MS
            reloadHome('unresponsive after grace period; kill not reported')
          }, FORCED_KILL_REPORT_TIMEOUT_MS)
          return
        }
        reloadHome(problem)
      } catch (err) {
        giveUp(`reload failed; ${problem}; ${String(err)}`)
      }
      return
    }

    if (state.unresponsiveSince !== null) {
      const remaining = HOME_UNRESPONSIVE_GRACE_MS - (now - state.unresponsiveSince)
      hangTimer = setTimeout(() => handleRecovery('check'), Math.max(0, remaining))
    }
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    if (expectingForcedCrash || performance.now() < lateKillReportUntil) {
      // Our own kill is the same attempt, even when its report comes after the backstop
      // reloaded: counting it again would spend the crash-loop budget twice for one
      // freeze. Reload once the old process is gone; a second reload is harmless and
      // also covers a real crash inside that window.
      expectingForcedCrash = false
      lateKillReportUntil = 0
      cancelKillReportTimer()
      reloadHome('unresponsive after grace period')
      return
    }
    if (details.reason === 'clean-exit') return
    handleRecovery('crashed', details.reason)
  })
  // Backstop: once fresh Home has loaded, the kill has been reported or never will be.
  win.webContents.on('did-finish-load', () => {
    expectingForcedCrash = false
  })
  win.on('unresponsive', () => {
    if (!expectingForcedCrash) handleRecovery('unresponsive')
  })
  win.on('responsive', () => handleRecovery('responsive'))
  app.once('before-quit', stopRecovery)
  win.once('closed', () => {
    stopRecovery()
    app.removeListener('before-quit', stopRecovery)
  })
}

export function getLauncherWindow(): BrowserWindow | null {
  return launcherWindow
}

export function createAdminWindow(): BrowserWindow {
  if (adminWindow && !adminWindow.isDestroyed()) {
    if (!QUIET_E2E_WINDOWS) {
      adminWindow.moveTop()
      adminWindow.focus()
    }
    return adminWindow
  }

  // The kiosk Home is always on top, so a plain admin window opened behind it
  // and Ctrl+Shift+A looked dead. Making admin always on top too only moved the
  // problem: its file pickers and the ChatGPT sign-in browser then opened behind
  // both. So while a caregiver has admin open, Home steps down from always on
  // top, and admin, owned by Home, stays above it even when a click lands on
  // Home. Home goes back on top when admin closes.
  const kioskHome =
    KIOSK_ENABLED && launcherWindow && !launcherWindow.isDestroyed() ? launcherWindow : undefined
  if (kioskHome) setHomeOnTop(kioskHome, false)
  adminWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    ...(kioskHome ? { parent: kioskHome } : {}),
    ...quietWindowOptions(),
    // Shown at once as before; under e2e, quietly once it can paint.
    show: !QUIET_E2E_WINDOWS,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/admin.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    adminWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/admin/index.html`)
  } else {
    adminWindow.loadFile(join(__dirname, '../renderer/admin/index.html'))
  }

  if (QUIET_E2E_WINDOWS) adminWindow.once('ready-to-show', () => showWindow(adminWindow))
  adminWindow.on('closed', () => {
    adminWindow = null
    if (kioskHome && !kioskHome.isDestroyed()) setHomeOnTop(kioskHome, true)
  })

  return adminWindow
}

function registerGlobalShortcuts(): void {
  // Always-available escape hatch, regardless of kiosk mode.
  globalShortcut.register('Ctrl+Shift+Q', () => {
    // Deliberate quit: tell the watchdog not to bring the kiosk back.
    writeQuitFlag(app.getPath('userData'))
    app.quit()
  })
  globalShortcut.register('Ctrl+Shift+A', () => createAdminWindow())

  if (!KIOSK_ENABLED) return

  // Swallow the most common accidental-escape combinations while the kiosk
  // is focused. This cannot block the Windows key or Alt+Tab at the OS level
  // without a lower-level hook - matching the old app's actual capability,
  // not overselling what Electron's globalShortcut can do.
  globalShortcut.register('Alt+F4', () => {})
  globalShortcut.register('Ctrl+Shift+Escape', () => createAdminWindow())
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
}
