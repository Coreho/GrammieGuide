import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcResponse } from '@shared/ipcContract'
import { logActivity } from '../services/activityLog/activityLog'
import type { RavelryService } from '../services/ravelry/ravelryService'
import { getAdminWindow } from '../windows/windowManager'
import { requireAdminUnlocked } from './requireAdminUnlocked'

function requireCaregiver(event: IpcMainInvokeEvent): void {
  requireAdminUnlocked()
  if (
    event.sender !== getAdminWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Caregiver window required')
  }
}

/**
 * Caregiver-only, and Home never reaches any of it: she only ever sees the saved copies
 * that knitting:home serves. The key arrives from the admin form once and never goes back
 * out, and logs say a key changed, never what it was or what was searched for.
 */
export function registerRavelryIpc(service: () => RavelryService): void {
  ipcMain.handle('ravelry:status', async (event): Promise<IpcResponse<'ravelry:status'>> => {
    requireCaregiver(event)
    return service().status()
  })

  ipcMain.handle(
    'ravelry:saveKey',
    async (
      event,
      req: { username?: unknown; key?: unknown }
    ): Promise<IpcResponse<'ravelry:saveKey'>> => {
      requireCaregiver(event)
      const checked = await service().checkKey(req?.username, req?.key)
      // The lock or the window may have changed while Ravelry was answering.
      requireCaregiver(event)
      service().saveKey(checked)
      logActivity('ravelry-key-saved')
      return service().status()
    }
  )

  ipcMain.handle('ravelry:removeKey', async (event): Promise<IpcResponse<'ravelry:removeKey'>> => {
    requireCaregiver(event)
    service().removeKey()
    logActivity('ravelry-key-removed')
    return service().status()
  })

  ipcMain.handle(
    'ravelry:search',
    async (event, req: { query?: unknown }): Promise<IpcResponse<'ravelry:search'>> => {
      requireCaregiver(event)
      const results = await service().search(req?.query)
      requireCaregiver(event)
      return results
    }
  )
}
