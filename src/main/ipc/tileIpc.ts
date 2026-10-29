import { ipcMain, shell } from 'electron'
import { getConfig } from '../config/store'
import { getLauncherWindow, stepHomeDown } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { tilesInHome } from '@shared/homeLayout'

export function registerTileIpc(): void {
  let opening = false
  let restoreFocus: (() => void) | null = null
  ipcMain.handle('tile:openApp', async (event, req: { id?: unknown }) => {
    // Only open a path already saved by the caregiver, never a path supplied by web content.
    const launcher = getLauncherWindow()
    if (!launcher || event.sender !== launcher.webContents) return { ok: false }
    const config = getConfig()
    const tile = tilesInHome(config.display.homeLayout, config.tiles).find(
      (t) => t.id === req?.id && t.type === 'app'
    )
    if (!tile?.appPath) return { ok: false }
    if (opening) return { ok: false }
    restoreFocus?.()
    opening = true
    const restore = (): void => {
      launcher.removeListener('focus', restore)
      stepHomeDown('app', false)
      restoreFocus = null
    }
    restoreFocus = restore
    try {
      // A configured native app needs to appear above the kiosk. Home goes back
      // on top when she returns to its window, unless admin is still open.
      stepHomeDown('app', true)
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
