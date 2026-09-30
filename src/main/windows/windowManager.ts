import { BrowserWindow, globalShortcut, app } from 'electron'
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

let launcherWindow: BrowserWindow | null = null
let adminWindow: BrowserWindow | null = null

export function createLauncherWindow(): BrowserWindow {
  launcherWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    fullscreen: KIOSK_ENABLED,
    alwaysOnTop: KIOSK_ENABLED,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/launcher.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  launcherWindow.on('ready-to-show', () => launcherWindow?.show())
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
    adminWindow.focus()
    return adminWindow
  }

  adminWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/admin.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    adminWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/admin/index.html`)
  } else {
    adminWindow.loadFile(join(__dirname, '../renderer/admin/index.html'))
  }

  adminWindow.on('closed', () => {
    adminWindow = null
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
