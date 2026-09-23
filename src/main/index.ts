import { app } from 'electron'
import { join } from 'path'
import { loadConfig, getConfig } from './config/store'
import { startHeartbeat, stopHeartbeat } from './services/reliability/watchdog'
import { registerAllIpc } from './ipc'
import {
  createLauncherWindow,
  createAdminWindow,
  getLauncherWindow,
  unregisterAllShortcuts
} from './windows/windowManager'
import { initEmbeddedBrowser, isBrowserOpen, getIdleMs, closeEmbeddedBrowser } from './services/browser/embeddedBrowser'
import { logActivity } from './services/activityLog/activityLog'

/**
 * Thin bootstrap: wires services together and nothing else, unlike the old
 * app's index.js which grew to ~500 lines by also owning every reliability
 * timer and window-creation detail inline.
 */

const INACTIVITY_CHECK_INTERVAL_MS = 30_000
let inactivityTimer: NodeJS.Timeout | null = null

function startInactivityWatch(): void {
  inactivityTimer = setInterval(() => {
    if (!isBrowserOpen()) return
    const timeoutMs = getConfig().confusion.inactivityTimeoutMinutes * 60_000
    if (getIdleMs() >= timeoutMs) {
      closeEmbeddedBrowser()
      logActivity('browser-inactivity-timeout')
      getLauncherWindow()?.webContents.send('browser:idle-timeout', {})
    }
  }, INACTIVITY_CHECK_INTERVAL_MS)
}

app.whenReady().then(() => {
  loadConfig()
  registerAllIpc()
  const win = createLauncherWindow()
  initEmbeddedBrowser(win)
  startInactivityWatch()
  startHeartbeat(join(app.getPath('userData'), 'heartbeat.txt'))

  // Playwright can't send a real Ctrl+Shift+A keypress to a kiosk-locked
  // window, so E2E tests need a way to open the admin window directly.
  // Only active when a test explicitly opts in via env var.
  if (process.env['GRAMMIEGUIDE_E2E'] === '1') {
    ;(globalThis as unknown as { __e2e__: unknown }).__e2e__ = { createAdminWindow }
  }
})

app.on('window-all-closed', () => {
  stopHeartbeat()
  if (inactivityTimer) clearInterval(inactivityTimer)
  unregisterAllShortcuts()
  if (process.platform !== 'darwin') app.quit()
})
