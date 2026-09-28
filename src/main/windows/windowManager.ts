import { BrowserWindow, globalShortcut, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { writeQuitFlag } from '../services/reliability/watchdog'

/**
 * Kiosk lockdown, ported conceptually from the old app's windows.js. Real
 * fullscreen/always-on-top/escape-shortcut-swallowing only applies when NOT
 * running under `npm run dev` - locking a dev machine's real desktop into
 * kiosk mode with no way to Alt+Tab out is a genuine risk to whoever is
 * sitting at the keyboard testing it, not just the eventual kiosk deployment.
 * `Ctrl+Shift+Q` always remains as an escape hatch regardless of mode.
 */
const KIOSK_ENABLED = !is.dev

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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    launcherWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/launcher/index.html`)
  } else {
    launcherWindow.loadFile(join(__dirname, '../renderer/launcher/index.html'))
  }

  registerGlobalShortcuts()
  return launcherWindow
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
