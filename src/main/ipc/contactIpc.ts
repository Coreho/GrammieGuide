import { ipcMain } from 'electron'
import type { IpcResponse } from '@shared/ipcContract'
import { getContactRequests } from '../services/contacts/contactRuntime'
import { requireAdminUnlocked } from './requireAdminUnlocked'

/** TASK-25 can read saved outcomes without gaining a send API or caregiver phone numbers. */
export function registerContactIpc(): void {
  ipcMain.handle('contacts:list', async (): Promise<IpcResponse<'contacts:list'>> => {
    requireAdminUnlocked()
    return getContactRequests().list()
  })
}
