import { ipcMain, shell } from 'electron'
import { getConfig } from '../config/store'
import { getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'

export function registerTileIpc(): void {
  let opening = false
  let restoreFocus: (() => void) | null = null
  ipcMain.handle('tile:openApp', async (event, req: { id?: unknown }) => {
    // Only open a path already saved by the caregiver, never a path supplied by web content.
    const launcher = getLauncherWindow()
    if (!launcher || event.sender !== launcher.webContents) return { ok: false }
    const tile = getConfig().tiles.find((t) => t.id === req?.id && t.type === 'app')
    if (!tile?.appPath) return { ok: false }
    if (opening) return { ok: false }
    restoreFocus?.()
    opening = true
    const wasOnTop = launcher.isAlwaysOnTop()
    const restore = (): void => {
      launcher.removeListener('focus', restore)
      if (!launcher.isDestroyed()) launcher.setAlwaysOnTop(wasOnTop)
      restoreFocus = null
    }
    restoreFocus = restore
    try {
      // A configured native app needs to appear above the kiosk. Restore the
      // kiosk's previous stacking policy when she returns to its window.
      launcher.setAlwaysOnTop(false)
      launcher.once('focus', restore)
      const error = await shell.openPath(tile.appPath)
      if (error) restore()
      logActivity(error ? 'tile-app-unavailable' : 'tile-app-opened', tile.id)
      return { ok: !error }
    } catch {
      restore()
      logActivity('tile-app-unavailable', tile.id)
      return { ok: false }
    } finally {
      opening = false
    }
  })
}
