import { ipcMain } from 'electron'
import { getConfig } from '../config/store'
import {
  isPinSet,
  setPin,
  unlockAdmin,
  lockAdmin,
  isAdminUnlocked
} from '../services/auth/adminAuth'
import { requireAdminUnlocked } from './requireAdminUnlocked'

export function registerAdminIpc(): void {
  ipcMain.handle('admin:isPinSet', () => isPinSet())
  ipcMain.handle('admin:setPin', (_e, req: { newPin: string; currentPin?: string }) =>
    setPin(req.newPin, req.currentPin)
  )
  ipcMain.handle('admin:unlock', (_e, req: { pin: string }) => unlockAdmin(req.pin))
  ipcMain.handle('admin:lock', () => lockAdmin())
  ipcMain.handle('admin:isUnlocked', () => isAdminUnlocked())
  ipcMain.handle('admin:hasApiKey', () => {
    requireAdminUnlocked()
    return Boolean(getConfig().buddy.anthropicApiKey)
  })
}
