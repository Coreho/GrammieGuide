import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipcContract'

function invoke<C extends IpcChannel>(channel: C, req?: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, req)
}

const launcherApi = {
  getConfig: () => invoke('config:get'),
  setConfig: (patch: IpcRequest<'config:set'>) => invoke('config:set', patch)
}

contextBridge.exposeInMainWorld('launcher', launcherApi)

export type LauncherApi = typeof launcherApi
