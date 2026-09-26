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
  setApiKey: (apiKey: string) => invoke('admin:setApiKey', { apiKey }),
  /** "Try this voice": same synthesis Buddy uses, so what the caregiver hears is what she'll hear. */
  previewVoice: (text: string, voice: string) => invoke('buddy:speak', { text, voice }),
  previewOldLauncherImport: () => invoke('admin:previewOldLauncherImport'),
  applyOldLauncherImport: () => invoke('admin:applyOldLauncherImport'),

  getActivityLog: (limit?: number) => invoke('activity:get', { limit }),
  getReliabilityLog: (limit?: number) => invoke('reliability:getLog', { limit }),
  testVolume: () => invoke('reliability:testVolume'),
  testWifiDiscovery: () => invoke('reliability:testWifiDiscovery'),
  checkSystemTasks: () => invoke('reliability:testWatchdogRegistration')
}

contextBridge.exposeInMainWorld('admin', adminApi)

export type AdminApi = typeof adminApi
