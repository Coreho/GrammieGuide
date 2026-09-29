import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipcContract'
import { getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { openUrl } from '../services/browser/embeddedBrowser'
import { newsService } from '../services/news/news'

/** Like app tiles, only Home may ask, and only about a News tile the caregiver saved. */
function fromLauncher(event: IpcMainInvokeEvent): boolean {
  const launcher = getLauncherWindow()
  return Boolean(launcher && event.sender === launcher.webContents)
}

export function registerNewsIpc(): void {
  ipcMain.handle(
    'news:get',
    async (event, req: IpcRequest<'news:get'>): Promise<IpcResponse<'news:get'>> => {
      if (!fromLauncher(event) || typeof req?.tileId !== 'string') return { ok: false }
      logActivity('news-opened')
      return newsService.get(req.tileId)
    }
  )

  ipcMain.handle('news:open', (event, req: IpcRequest<'news:open'>): IpcResponse<'news:open'> => {
    if (!fromLauncher(event) || typeof req?.tileId !== 'string') return { ok: false }
    if (req.storyId !== undefined && typeof req.storyId !== 'string') return { ok: false }
    // The renderer never supplies the address: it's the saved site, or a story
    // this service fetched, so Home can't be used to open anything else.
    const url = newsService.destination(req.tileId, req.storyId)
    if (!url) return { ok: false }
    const result = openUrl(url, { privateNavigation: true })
    if (result.ok) logActivity(req.storyId === undefined ? 'news-site-opened' : 'news-story-opened')
    return { ok: result.ok }
  })
}
