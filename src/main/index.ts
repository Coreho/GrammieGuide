import { app } from 'electron'
import { join } from 'path'
import { loadConfig, getConfig } from './config/store'
import { startHeartbeat, stopHeartbeat } from './services/reliability/watchdog'
import { startKioskServices, stopKioskServices } from './services/reliability/kioskServices'
import { registerAllIpc } from './ipc'
import {
  createLauncherWindow,
  createAdminWindow,
  getLauncherWindow,
  unregisterAllShortcuts,
  QUIET_E2E_WINDOWS
} from './windows/windowManager'
import {
  initEmbeddedBrowser,
  isBrowserOpen,
  getIdleMs,
  closeEmbeddedBrowser,
  overrideOnlineCheckForTests
} from './services/browser/embeddedBrowser'
import { logActivity } from './services/activityLog/activityLog'
import { registerMediaScheme, installMediaProtocol } from './services/media/mediaProtocol'
import { installAdminMicrophonePermissions } from './services/photos/adminMicrophone'
import {
  refreshAdBlockerLists,
  startBrowserProtection,
  stopAdBlocker
} from './services/browser/adBlocker'

/**
 * Thin bootstrap: wires services together and nothing else, unlike the old
 * app's index.js which grew to ~500 lines by also owning every reliability
 * timer and window-creation detail inline.
 */

/**
 * One GrammieGuide at a time. A second launch (the desktop shortcut, the
 * installer's "run now", the logon task firing while she's already in) would
 * otherwise open a second kiosk over the first, both writing the config, the
 * media indexes and the heartbeat. It exits at once, before touching anything,
 * and the running one comes to the front. This never blocks recovery: the
 * watchdog kills the old process before it relaunches. Electron keys the lock on
 * the userData folder, so e2e runs in their own temp profiles don't collide.
 */
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    const win = getLauncherWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    // The single-instance e2e test only needs the second launch to exit.
    if (!QUIET_E2E_WINDOWS) win.focus()
  })
}

registerMediaScheme()

/**
 * Playwright drives the real app, and on an unattended machine Windows marks the
 * window occluded. Chromium then stops delivering sizes to the page: innerWidth
 * ignores setContentSize, requestAnimationFrame and ResizeObserver stall, and any
 * test that resizes or waits on Buddy hangs rather than fails. Turning off native
 * occlusion detection makes the window behave as if it were in the foreground.
 *
 * E2E only - on the kiosk the window really is fullscreen and on top, so this
 * would change nothing, and it must be set before the app is ready.
 */
if (process.env['GRAMMIEGUIDE_E2E'] === '1') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

const INACTIVITY_CHECK_INTERVAL_MS = 30_000
let inactivityTimer: NodeJS.Timeout | null = null

/** `extraIdleMs` lets e2e tests run this real check without waiting minutes. */
function closeBrowserIfIdle(extraIdleMs = 0): void {
  if (!isBrowserOpen()) return
  const timeoutMs = getConfig().confusion.inactivityTimeoutMinutes * 60_000
  if (getIdleMs() + extraIdleMs >= timeoutMs) {
    closeEmbeddedBrowser()
    logActivity('browser-inactivity-timeout')
    getLauncherWindow()?.webContents.send('browser:idle-timeout', {})
  }
}

function startInactivityWatch(): void {
  inactivityTimer = setInterval(() => closeBrowserIfIdle(), INACTIVITY_CHECK_INTERVAL_MS)
}

app.whenReady().then(() => {
  loadConfig()
  registerAllIpc()
  installMediaProtocol()
  installAdminMicrophonePermissions()
  const win = createLauncherWindow()
  initEmbeddedBrowser(win)
  startInactivityWatch()
  startHeartbeat(join(app.getPath('userData'), 'heartbeat.txt'))
  startKioskServices()

  // Deny-all permissions, blocked downloads and the ad blocker for the web
  // session. Started without awaiting: the filter lists may need the network the
  // first time, and Home must not wait on that. The cache makes later starts
  // offline, and a failure here only means browsing is unfiltered.
  void startBrowserProtection(app.getPath('userData'))

  // Playwright can't send a real Ctrl+Shift+A keypress to a kiosk-locked
  // window, so E2E tests need a way to open the admin window directly, a way
  // to run the idle check without waiting out the timeout, and a stand-in
  // for Windows' online state.
  // Only active when a test explicitly opts in via env var.
  if (process.env['GRAMMIEGUIDE_E2E'] === '1') {
    ;(globalThis as unknown as { __e2e__: unknown }).__e2e__ = {
      createAdminWindow,
      closeBrowserIfIdle,
      setDeviceOnline: (online: boolean) => overrideOnlineCheckForTests(() => online),
      // The real refresh interval is 24 hours; a test needs to run one now, with
      // the network already broken, to prove a failed update changes nothing.
      refreshAdBlockerLists
    }
  }
})

app.on('window-all-closed', () => {
  stopHeartbeat()
  stopKioskServices()
  stopAdBlocker()
  if (inactivityTimer) clearInterval(inactivityTimer)
  unregisterAllShortcuts()
  if (process.platform !== 'darwin') app.quit()
})
