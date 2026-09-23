import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { loadConfig } from './config/store'
import { startHeartbeat, stopHeartbeat } from './services/reliability/watchdog'
import { registerAllIpc } from './ipc'

/**
 * M1 scope: boot a plain window, load/validate config, start the heartbeat.
 * Kiosk lockdown, BrowserView embedding, and the tile-grid renderer land in
 * M2 (see the plan). This file stays a thin bootstrap - it wires services
 * together and nothing else, unlike the old app's index.js which grew to
 * ~500 lines by also owning every reliability timer inline.
 */

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/launcher.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/launcher/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/launcher/index.html'))
  }
}

app.whenReady().then(() => {
  loadConfig()
  registerAllIpc()
  createWindow()
  startHeartbeat(join(app.getPath('userData'), 'heartbeat.txt'))
})

app.on('window-all-closed', () => {
  stopHeartbeat()
  if (process.platform !== 'darwin') app.quit()
})
