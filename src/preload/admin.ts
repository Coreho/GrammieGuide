import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse, IpcEvents } from '@shared/ipcContract'
import type { Config } from '@shared/configSchema'
import { plainErrorMessage } from '@shared/ipcErrors'

/**
 * Re-throw with the message the main process actually wrote. Main throws plain,
 * caregiver-readable sentences on purpose (see libraryIpc.ts), and Electron's
 * "Error invoking remote method '...':" wrapper would otherwise bury them.
 */
function invoke<C extends IpcChannel>(channel: C, req?: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, req).catch((error: unknown) => {
    throw new Error(plainErrorMessage(error))
  })
}

const adminApi = {
  prepareWhatsApp: () => invoke('whatsapp:prepare'),
  closeWhatsAppCalls: () => invoke('whatsapp:closeCalls'),
  getWhatsAppSetup: () => invoke('whatsapp:setupState'),
  openWhatsAppSetup: () => invoke('whatsapp:openSetup'),
  closeWhatsAppSetup: () => invoke('whatsapp:closeSetup'),
  onWhatsAppSetupChanged: (
    cb: (state: IpcEvents['whatsapp:setupChanged']) => void
  ): (() => void) => {
    const listener = (_event: unknown, state: IpcEvents['whatsapp:setupChanged']): void => cb(state)
    ipcRenderer.on('whatsapp:setupChanged', listener)
    return () => ipcRenderer.removeListener('whatsapp:setupChanged', listener)
  },
  getWhatsAppState: () => invoke('whatsapp:state'),
  controlWhatsApp: (command: IpcRequest<'whatsapp:command'>) => invoke('whatsapp:command', command),
  onWhatsAppChanged: (cb: (state: IpcEvents['whatsapp:changed']) => void): (() => void) => {
    const listener = (_event: unknown, state: IpcEvents['whatsapp:changed']): void => cb(state)
    ipcRenderer.on('whatsapp:changed', listener)
    return () => ipcRenderer.removeListener('whatsapp:changed', listener)
  },
  chatGptState: () => invoke('chatgpt:state'),
  chatGptConnect: (id?: string) => invoke('chatgpt:connect', { id }),
  chatGptCancel: () => invoke('chatgpt:cancel'),
  chatGptSelect: (id: string) => invoke('chatgpt:select', { id }),
  chatGptModels: () => invoke('chatgpt:models'),
  chatGptTest: (model: string) => invoke('chatgpt:test', { model }),
  chatGptWelcome: () => invoke('chatgpt:welcome'),
  chatGptSignOut: () => invoke('chatgpt:signOut'),
  chatGptUsage: () => invoke('chatgpt:usage'),
  listContactRequests: () => invoke('contacts:list'),
  getContactSettings: () => invoke('contacts:getSettings'),
  saveContactSettings: (settings: IpcRequest<'contacts:saveSettings'>) =>
    invoke('contacts:saveSettings', settings),
  setContactCredentials: (credentials: IpcRequest<'admin:setContactCredentials'>) =>
    invoke('admin:setContactCredentials', credentials),
  recordNarration: (request: IpcRequest<'photos:recordNarration'>) =>
    invoke('photos:recordNarration', request),
  attachNarration: (id: string) => invoke('photos:attachNarration', { id }),
  removeNarration: (id: string) => invoke('photos:removeNarration', { id }),
  setNarrationAutoPlay: (id: string, enabled: boolean) =>
    invoke('photos:setNarrationAutoPlay', { id, enabled }),
  getAudio: () => invoke('audio:get'),
  resetAudioOwner: () => invoke('audio:resetOwner'),
  audioEvent: (event: IpcRequest<'audio:event'>) => invoke('audio:event', event),
  onAudioChanged: (cb: (update: IpcEvents['audio:changed']) => void): (() => void) => {
    const listener = (_event: unknown, update: IpcEvents['audio:changed']): void => cb(update)
    ipcRenderer.on('audio:changed', listener)
    return () => ipcRenderer.removeListener('audio:changed', listener)
  },
  getMusicLibrary: () => invoke('music:list'),
  importMusic: () => invoke('music:importFiles'),
  saveMusicSettings: (settings: IpcRequest<'music:saveSettings'>) =>
    invoke('music:saveSettings', settings),
  removeMusicTrack: (id: string) => invoke('music:removeTrack', { id }),
  onMusicImportProgress: (cb: (count: IpcEvents['music:importProgress']) => void): (() => void) => {
    const listener = (_event: unknown, count: IpcEvents['music:importProgress']): void => cb(count)
    ipcRenderer.on('music:importProgress', listener)
    return () => ipcRenderer.removeListener('music:importProgress', listener)
  },
  saveBackup: () => invoke('backup:save'),
  restoreBackup: () => invoke('backup:restore'),
  onPhotosChanged: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('photos:changed', listener)
    return () => ipcRenderer.removeListener('photos:changed', listener)
  },
  listPhotos: () => invoke('photos:listAll'),
  importPhotos: () => invoke('photos:import'),
  updatePhoto: (request: IpcRequest<'photos:update'>) => invoke('photos:update', request),
  removePhoto: (id: string) => invoke('photos:remove', { id }),
  onPhotoImportProgress: (
    cb: (count: IpcEvents['photos:importProgress']) => void
  ): (() => void) => {
    const listener = (_event: unknown, count: IpcEvents['photos:importProgress']): void => cb(count)
    ipcRenderer.on('photos:importProgress', listener)
    return () => ipcRenderer.removeListener('photos:importProgress', listener)
  },
  listLibrary: (request: IpcRequest<'library:list'>) => invoke('library:list', request),
  importLibrary: (request: IpcRequest<'library:import'>) => invoke('library:import', request),
  updateLibrary: (request: IpcRequest<'library:update'>) => invoke('library:update', request),
  removeLibrary: (request: IpcRequest<'library:remove'>) => invoke('library:remove', request),
  commandBuddy: (command: IpcRequest<'buddy:command'>) => invoke('buddy:command', command),
  getConfig: () => invoke('config:get'),
  setConfig: (patch: Partial<Config>) => invoke('config:set', patch),

  isPinSet: () => invoke('admin:isPinSet'),
  setPin: (newPin: string, currentPin?: string) => invoke('admin:setPin', { newPin, currentPin }),
  unlock: (pin: string) => invoke('admin:unlock', { pin }),
  lock: () => invoke('admin:lock'),
  isUnlocked: () => invoke('admin:isUnlocked'),
  /** "Try this voice": same synthesis Buddy uses, so what the caregiver hears is what she'll hear. */
  previewVoice: (text: string, voice: string) =>
    invoke('buddy:speak', { text, voice, path: 'online' }),
  /** The voice on this computer; waits for it to load the first time. */
  previewLocalVoice: (text: string, localVoice: string) =>
    invoke('buddy:speak', { text, localVoice, path: 'local' }),
  previewOldLauncherImport: () => invoke('admin:previewOldLauncherImport'),
  applyOldLauncherImport: () => invoke('admin:applyOldLauncherImport'),

  getActivityLog: (limit?: number) => invoke('activity:get', { limit }),
  getBlockedSites: () => invoke('browser:blockedSites'),
  getReliabilityLog: (limit?: number) => invoke('reliability:getLog', { limit }),
  testVolume: () => invoke('reliability:testVolume'),
  testWifiDiscovery: () => invoke('reliability:testWifiDiscovery'),
  checkSystemTasks: () => invoke('reliability:testWatchdogRegistration'),

  listChecks: () => invoke('checks:list'),
  runCheck: (id: IpcRequest<'checks:run'>['id']) => invoke('checks:run', { id }),
  cancelChecks: (id?: IpcRequest<'checks:cancel'>['id']) => invoke('checks:cancel', { id }),
  startVoiceCheck: () => invoke('checks:voiceStart'),
  reportVoiceCheck: (request: IpcRequest<'checks:voiceReport'>) =>
    invoke('checks:voiceReport', request),
  onChecksChanged: (cb: (results: IpcEvents['checks:changed']) => void): (() => void) => {
    const listener = (_event: unknown, results: IpcEvents['checks:changed']): void => cb(results)
    ipcRenderer.on('checks:changed', listener)
    return () => ipcRenderer.removeListener('checks:changed', listener)
  }
}

contextBridge.exposeInMainWorld('admin', adminApi)

export type AdminApi = typeof adminApi
