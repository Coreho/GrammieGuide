import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipcContract'

function invoke<C extends IpcChannel>(channel: C, req?: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, req)
}

const adminApi = {
  getConfig: () => invoke('config:get'),
  setConfig: (patch: IpcRequest<'config:set'>) => invoke('config:set', patch),
  getReliabilityLog: (limit?: number) => invoke('reliability:getLog', { limit }),
  testVolume: () => invoke('reliability:testVolume'),
  testWifiDiscovery: () => invoke('reliability:testWifiDiscovery')
}

contextBridge.exposeInMainWorld('admin', adminApi)

export type AdminApi = typeof adminApi
