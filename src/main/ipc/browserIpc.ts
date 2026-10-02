import { ipcMain } from 'electron'
import {
  openUrl,
  goBack,
  closeEmbeddedBrowser,
  retryPage,
  dismissBlocked
} from '../services/browser/embeddedBrowser'

export function registerBrowserIpc(): void {
  ipcMain.handle('browser:open', (_e, req: { url: string }) => openUrl(req.url))
  ipcMain.handle('browser:goHome', () => closeEmbeddedBrowser())
  ipcMain.handle('browser:goBack', () => goBack())
  ipcMain.handle('browser:retry', () => retryPage())
  ipcMain.handle('browser:dismissBlocked', () => dismissBlocked())
}
