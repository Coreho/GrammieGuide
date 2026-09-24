import { ipcMain } from 'electron'
import { getConfig, setConfig } from '../config/store'
import { logActivity } from '../services/activityLog/activityLog'
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
  ipcMain.handle('admin:setApiKey', (_e, req: { apiKey: string }) => {
    requireAdminUnlocked()
    const apiKey = typeof req?.apiKey === 'string' ? req.apiKey.trim() : ''
    const buddy = getConfig().buddy
    setConfig({ buddy: { ...buddy, anthropicApiKey: apiKey || undefined } })
    logActivity(apiKey ? 'buddy-api-key-set' : 'buddy-api-key-cleared')
    return { ok: true }
  })
}
