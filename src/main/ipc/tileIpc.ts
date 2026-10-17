import { ipcMain, shell, type WebContents } from 'electron'
import { getConfig } from '../config/store'
import { getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { tilesInHome } from '@shared/homeLayout'
import { BUILTIN_GAME_KEYS, type BuiltinGameKey } from '@shared/games/gamesSchema'

export function registerTileIpc(): void {
  let opening = false
  let restoreFocus: (() => void) | null = null

  async function launchSavedExecutable(
    appPath: string,
    openedEvent: string,
    unavailableEvent: string,
    id: string
  ): Promise<{ ok: boolean }> {
    const launcher = getLauncherWindow()
    if (!launcher || opening) return { ok: false }
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
      const error = await shell.openPath(appPath)
      if (error) restore()
      logActivity(error ? unavailableEvent : openedEvent, id)
      return { ok: !error }
    } catch {
      restore()
      logActivity(unavailableEvent, id)
      return { ok: false }
    } finally {
      opening = false
    }
  }

  function isLauncherSender(sender: WebContents): boolean {
    const launcher = getLauncherWindow()
    return Boolean(launcher && sender === launcher.webContents)
  }

  ipcMain.handle('tile:openApp', async (event, req: { id?: unknown }) => {
    // Only open a path already saved by the caregiver, never a path supplied by web content.
    if (!isLauncherSender(event.sender)) return { ok: false }
    const config = getConfig()
    const tile = tilesInHome(config.display.homeLayout, config.tiles).find(
      (t) => t.id === req?.id && t.type === 'app'
    )
    if (!tile?.appPath) return { ok: false }
    return launchSavedExecutable(tile.appPath, 'tile-app-opened', 'tile-app-unavailable', tile.id)
  })

  ipcMain.handle('games:openInstalled', async (event, req: { id?: unknown }) => {
    if (!isLauncherSender(event.sender)) return { ok: false }
    const config = getConfig()
    const gamesTileVisible = tilesInHome(config.display.homeLayout, config.tiles).some(
      (t) => t.type === 'builtin' && t.builtinKey === 'games'
    )
    if (!gamesTileVisible) return { ok: false }
    const entry = config.games.installedGames.find((g) => g.id === req?.id)
    if (!entry?.appPath) return { ok: false }
    return launchSavedExecutable(
      entry.appPath,
      'games-app-opened',
      'games-app-unavailable',
      entry.id
    )
  })

  ipcMain.handle('games:reportBuiltin', (event, req: { game?: unknown }) => {
    if (!isLauncherSender(event.sender)) return false
    const game = typeof req?.game === 'string' ? req.game : ''
    if (!(BUILTIN_GAME_KEYS as readonly string[]).includes(game)) return false
    const config = getConfig()
    if (!config.games.enabledBuiltins.includes(game as BuiltinGameKey)) return false
    logActivity('games-builtin-opened', game)
    return true
  })
}
