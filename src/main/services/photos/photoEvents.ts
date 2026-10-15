import { BrowserWindow } from 'electron'
export function photosChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send('photos:changed', {})
  }
}
