import { app, ipcMain } from 'electron'
import { toPublicConfig } from '@shared/configSchema'
import { planOldLauncherImport, readOldLauncherConfig } from '../config/importOldLauncher'
import { getLauncherWindow } from '../windows/windowManager'
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

  ipcMain.handle('admin:previewOldLauncherImport', () => {
    requireAdminUnlocked()
    const old = readOldLauncherConfig(app.getPath('appData'))
    return old === null ? { found: false } : planOldLauncherImport(old, getConfig()).preview
  })

  ipcMain.handle('admin:applyOldLauncherImport', () => {
    requireAdminUnlocked()
    const old = readOldLauncherConfig(app.getPath('appData'))
    if (old === null) return { ok: false }
    const plan = planOldLauncherImport(old, getConfig())
    // Weather, display and confusion only - never tiles (set up fresh) and
    // never buddy/reliability, so no secret can be touched here.
    const updated = toPublicConfig(setConfig(plan.patch))
    getLauncherWindow()?.webContents.send('config:changed', updated)
    logActivity('old-launcher-settings-imported')
    return { ok: true }
  })
}
