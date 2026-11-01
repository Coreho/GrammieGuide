import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcResponse } from '@shared/ipcContract'
import { logActivity } from '../services/activityLog/activityLog'
import type { RavelryHomeBrowse } from '../services/ravelry/homeBrowse'
import type { RavelryService } from '../services/ravelry/ravelryService'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
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

function requireHome(event: IpcMainInvokeEvent): void {
  if (
    event.sender !== getLauncherWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Home window required')
  }
}

/** Home shows or hides Find a pattern and the Save button by whether a key is saved. */
function tellHome(): void {
  try {
    getLauncherWindow()?.webContents.send('knitting:changed', {})
  } catch {
    // Home reads it again the next time the shelf opens.
  }
}

/**
 * The key arrives from the admin form once and never goes back out, and logs say a key changed,
 * never what it was or what was searched for. Key and free search are caregiver-only. Home gets
 * the fixed categories and patterns main served her, and any failure is just `ok: false`.
 */
export function registerRavelryIpc(
  service: () => RavelryService,
  homeBrowse: () => RavelryHomeBrowse
): void {
  ipcMain.handle(
    'ravelry:homeCategories',
    async (event): Promise<IpcResponse<'ravelry:homeCategories'>> => {
      requireHome(event)
      return homeBrowse().categories()
    }
  )
  ipcMain.handle(
    'ravelry:homeBrowse',
    async (
      event,
      req: { category?: unknown; page?: unknown }
    ): Promise<IpcResponse<'ravelry:homeBrowse'>> => {
      requireHome(event)
      return homeBrowse().browse(req?.category, req?.page)
    }
  )
  ipcMain.handle(
    'ravelry:homePattern',
    async (event, req: { ravelryId?: unknown }): Promise<IpcResponse<'ravelry:homePattern'>> => {
      requireHome(event)
      return homeBrowse().preview(req?.ravelryId)
    }
  )

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
      tellHome()
      return service().status()
    }
  )

  ipcMain.handle('ravelry:removeKey', async (event): Promise<IpcResponse<'ravelry:removeKey'>> => {
    requireCaregiver(event)
    service().removeKey()
    logActivity('ravelry-key-removed')
    tellHome()
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
