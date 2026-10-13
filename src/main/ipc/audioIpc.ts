import { ipcMain, type WebContents } from 'electron'
import { audioEventSchema } from '@shared/audio/audioContract'
import type { IpcRequest } from '@shared/ipcContract'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import {
  clearAudioOwner,
  dispatchClientAudio,
  getAudioCoordinator
} from '../services/audio/audioRuntime'

function requireAudioClient(sender: WebContents, cleanup = false): 'launcher' | 'admin' {
  if (sender === getLauncherWindow()?.webContents) return 'launcher'
  if (sender === getAdminWindow()?.webContents) {
    // A caregiver can lock the panel while a preview is ending. Its own cleanup
    // still has to release the hold; it cannot end another renderer's sound.
    if (!cleanup) requireAdminUnlocked()
    return 'admin'
  }
  throw new Error('Audio client unavailable')
}

export function registerAudioIpc(): void {
  ipcMain.handle('audio:get', (event) => {
    requireAudioClient(event.sender)
    return getAudioCoordinator().snapshot()
  })
  ipcMain.handle('audio:resetOwner', (event) => {
    requireAudioClient(event.sender, true)
    return clearAudioOwner(event.sender.id)
  })
  ipcMain.handle('audio:event', (event, request: IpcRequest<'audio:event'>) => {
    const parsed = audioEventSchema.safeParse(request)
    if (!parsed.success) throw new Error('Invalid audio event')
    const role = requireAudioClient(event.sender, parsed.data.type === 'end')
    if (role !== 'launcher' && parsed.data.type.startsWith('music'))
      throw new Error('Music control unavailable')
    return dispatchClientAudio(event.sender, parsed.data)
  })
}
