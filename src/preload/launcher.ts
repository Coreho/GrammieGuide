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
  openAppTile: (id: string) => invoke('tile:openApp', { id }),
  onBuddyCommand: (cb: (command: IpcEvents['buddy:command']) => void) => on('buddy:command', cb),
  getNews: (tileId: string) => invoke('news:get', { tileId }),
  openNews: (tileId: string, storyId?: string) => invoke('news:open', { tileId, storyId }),
  getConfig: () => invoke('config:get'),
  getWeather: (label: string, units: 'imperial' | 'metric') =>
    invoke('weather:get', { label, units }),

  openBrowser: (url: string) => invoke('browser:open', { url }),
  goHome: () => invoke('browser:goHome'),
  goBack: () => invoke('browser:goBack'),
  retryPage: () => invoke('browser:retry'),
  dismissBlockedPage: () => invoke('browser:dismissBlocked'),
  reportActivity: () => ipcRenderer.send('browserView:activity'),

  buddyChat: (turns: BuddyChatTurn[]) => invoke('buddy:chat', { turns }),
  buddySpeak: (text: string) => invoke('buddy:speak', { text }),
  buddyListen: () => invoke('buddy:listen'),
  buddyCanListen: () => invoke('buddy:canListen'),

  onBrowserBlocked: (cb: (payload: IpcEvents['browser:blocked']) => void) =>
    on('browser:blocked', cb),
  onPageProblem: (cb: (payload: IpcEvents['browser:page-problem']) => void) =>
    on('browser:page-problem', cb),
  onIdleTimeout: (cb: () => void) => on('browser:idle-timeout', () => cb()),
  onConfigChanged: (cb: (config: IpcEvents['config:changed']) => void) => on('config:changed', cb)
}

contextBridge.exposeInMainWorld('launcher', launcherApi)

export type LauncherApi = typeof launcherApi
