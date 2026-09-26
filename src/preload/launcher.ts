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
  getConfig: () => invoke('config:get'),
  setFontStep: (step: number) => invoke('display:setFontStep', { step }),
  getWeather: (label: string, units: 'imperial' | 'metric') => invoke('weather:get', { label, units }),

  openBrowser: (url: string) => invoke('browser:open', { url }),
  goHome: () => invoke('browser:goHome'),
  goBack: () => invoke('browser:goBack'),
  reportActivity: () => ipcRenderer.send('browserView:activity'),

  buddyChat: (turns: BuddyChatTurn[]) => invoke('buddy:chat', { turns }),
  buddySpeak: (text: string) => invoke('buddy:speak', { text }),
  buddyListen: () => invoke('buddy:listen'),
  buddyCanListen: () => invoke('buddy:canListen'),

  onBrowserBlocked: (cb: (payload: IpcEvents['browser:blocked']) => void) => on('browser:blocked', cb),
  onIdleTimeout: (cb: () => void) => on('browser:idle-timeout', () => cb()),
  onConfigChanged: (cb: (config: IpcEvents['config:changed']) => void) => on('config:changed', cb)
}

contextBridge.exposeInMainWorld('launcher', launcherApi)

export type LauncherApi = typeof launcherApi
