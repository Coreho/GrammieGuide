import { ipcMain } from 'electron'
import { getActivityLog } from '../services/activityLog/activityLog'
import { requireAdminUnlocked } from './requireAdminUnlocked'

export function registerActivityIpc(): void {
  ipcMain.handle('activity:get', (_e, req: { limit?: number } = {}) => {
    requireAdminUnlocked()
    return getActivityLog(req?.limit)
  })
}
