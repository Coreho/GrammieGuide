import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipcContract'
import type { Config } from '@shared/configSchema'

function invoke<C extends IpcChannel>(channel: C, req?: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, req)
}

const adminApi = {
  getConfig: () => invoke('config:get'),
  setConfig: (patch: Partial<Config>) => invoke('config:set', patch),

  isPinSet: () => invoke('admin:isPinSet'),
  setPin: (newPin: string, currentPin?: string) => invoke('admin:setPin', { newPin, currentPin }),
  unlock: (pin: string) => invoke('admin:unlock', { pin }),
  lock: () => invoke('admin:lock'),
  isUnlocked: () => invoke('admin:isUnlocked'),
  hasApiKey: () => invoke('admin:hasApiKey'),

  getActivityLog: (limit?: number) => invoke('activity:get', { limit }),
  getReliabilityLog: (limit?: number) => invoke('reliability:getLog', { limit }),
  testVolume: () => invoke('reliability:testVolume'),
  testWifiDiscovery: () => invoke('reliability:testWifiDiscovery')
}

contextBridge.exposeInMainWorld('admin', adminApi)

export type AdminApi = typeof adminApi
