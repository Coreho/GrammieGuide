import { ipcMain } from 'electron'
import { z } from 'zod'
import { getConfig } from '../config/store'
import { getLauncherWindow } from '../windows/windowManager'
import { tilesInHome } from '@shared/homeLayout'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { blockedSites } from '../services/browser/blockedSites'
import {
  openUrl,
  openUrlAndWait,
  goBack,
  closeEmbeddedBrowser,
  retryPage,
  dismissBlocked,
  sendVideoCommand
} from '../services/browser/embeddedBrowser'

export function registerBrowserIpc(): void {
  ipcMain.handle(
    'browser:videoCommand',
    (event, command: unknown) =>
      event.sender === getLauncherWindow()?.webContents &&
      event.senderFrame === event.sender.mainFrame &&
      sendVideoCommand(command)
  )
  ipcMain.handle('browser:blockedSites', () => {
    requireAdminUnlocked()
    return blockedSites.list()
  })
  ipcMain.handle('browser:open', (_e, req: { url: string }) => openUrl(req.url))
  ipcMain.handle('browser:openTile', (event, req: unknown) => {
    const parsed = z.object({ tileId: z.string() }).strict().safeParse(req)
    if (event.sender !== getLauncherWindow()?.webContents || !parsed.success) return 'refused'
    const config = getConfig()
    const tile = tilesInHome(config.display.homeLayout, config.tiles).find(
      (tile) => tile.id === parsed.data.tileId && tile.type === 'web'
    )
    return tile?.url ? openUrlAndWait(tile.url) : 'refused'
  })
  ipcMain.handle('browser:goHome', () => closeEmbeddedBrowser())
  ipcMain.handle('browser:goBack', () => goBack())
  ipcMain.handle('browser:retry', () => retryPage())
  ipcMain.handle('browser:dismissBlocked', () => dismissBlocked())
}
