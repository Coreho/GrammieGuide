import { ipcMain } from 'electron'
import { openUrl, goBack, closeEmbeddedBrowser } from '../services/browser/embeddedBrowser'

export function registerBrowserIpc(): void {
  ipcMain.handle('browser:open', (_e, req: { url: string }) => openUrl(req.url))
  ipcMain.handle('browser:goHome', () => closeEmbeddedBrowser())
  ipcMain.handle('browser:goBack', () => goBack())
}
