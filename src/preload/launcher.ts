import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  IpcEventName,
  IpcEvents,
  BuddyChatTurn
} from '@shared/ipcContract'

function invoke<C extends IpcChannel>(channel: C, req?: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, req)
}

function on<E extends IpcEventName>(event: E, cb: (payload: IpcEvents[E]) => void): () => void {
  const listener = (_e: unknown, payload: IpcEvents[E]): void => cb(payload)
  ipcRenderer.on(event, listener)
  return () => ipcRenderer.removeListener(event, listener)
}

const launcherApi = {
  getAudio: () => invoke('audio:get'),
  buddyAction: (action: IpcRequest<'buddy:action'>) => invoke('buddy:action', action),
  resetAudioOwner: () => invoke('audio:resetOwner'),
  audioEvent: (event: IpcRequest<'audio:event'>) => invoke('audio:event', event),
  onAudioChanged: (cb: (update: IpcEvents['audio:changed']) => void) => on('audio:changed', cb),
  getMusicPlaylists: () => invoke('music:getPlaylists'),
  reportMusic: (event: IpcRequest<'music:report'>) => invoke('music:report', event),
  openPhotos: () => invoke('photos:open'),
  listPhotos: () => invoke('photos:listVisible'),
  getTileImages: () => invoke('photos:tileImages'),
  onPhotosChanged: (cb: () => void) => on('photos:changed', cb),
  openAppTile: (id: string) => invoke('tile:openApp', { id }),
  onBuddyCommand: (cb: (command: IpcEvents['buddy:command']) => void) => on('buddy:command', cb),
  getNews: (tileId: string) => invoke('news:get', { tileId }),
  openNews: (tileId: string, storyId?: string) => invoke('news:open', { tileId, storyId }),
  getConfig: () => invoke('config:get'),
  getWeather: (label: string, units: 'imperial' | 'metric') =>
    invoke('weather:get', { label, units }),

  openBrowser: (url: string) => invoke('browser:open', { url }),
  openBrowserTile: (tileId: string) => invoke('browser:openTile', { tileId }),
  goHome: () => invoke('browser:goHome'),
  goBack: () => invoke('browser:goBack'),
  retryPage: () => invoke('browser:retry'),
  dismissBlockedPage: () => invoke('browser:dismissBlocked'),
  openRecoveryCheck: () => invoke('browser:openRecoveryCheck'),
  reportActivity: () => ipcRenderer.send('browserView:activity'),

  buddyChat: (turns: BuddyChatTurn[]) => invoke('buddy:chat', { turns }),
  buddySpeak: (text: string) => invoke('buddy:speak', { text }),
  buddyListen: () => invoke('buddy:listen'),
  buddyCancelListen: () => invoke('buddy:cancelListen'),
  buddyCanListen: () => invoke('buddy:canListen'),

  onPageProblem: (cb: (payload: IpcEvents['browser:page-problem']) => void) =>
    on('browser:page-problem', cb),
  onIdleTimeout: (cb: () => void) => on('browser:idle-timeout', () => cb()),
  onReturnHome: (cb: () => void) => on('browser:return-home', () => cb()),
  onRecoveryCheck: (cb: () => void) => on('checks:recovery-start', () => cb()),
  onConfigChanged: (cb: (config: IpcEvents['config:changed']) => void) => on('config:changed', cb)
}

contextBridge.exposeInMainWorld('launcher', launcherApi)

export type LauncherApi = typeof launcherApi
