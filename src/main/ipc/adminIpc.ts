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
  ipcMain.handle('admin:hasApiKey', (_e, req: { provider?: unknown }) => {
    requireAdminUnlocked()
    const provider = req?.provider === 'openrouter' ? 'openrouter' : 'anthropic'
    const { anthropicApiKey, openrouterApiKey } = getConfig().buddy
    return Boolean(provider === 'openrouter' ? openrouterApiKey : anthropicApiKey)
  })
  ipcMain.handle('admin:setApiKey', (_e, req: { provider?: unknown; apiKey?: unknown }) => {
    requireAdminUnlocked()
    // An unknown provider falls back to Anthropic rather than writing to neither
    // key, so a malformed call can't leave the caregiver with no way in.
    const provider = req?.provider === 'openrouter' ? 'openrouter' : 'anthropic'
    const apiKey = typeof req?.apiKey === 'string' ? req.apiKey.trim() : ''
    const buddy = getConfig().buddy
    setConfig({
      buddy: {
        ...buddy,
        [provider === 'openrouter' ? 'openrouterApiKey' : 'anthropicApiKey']:
          apiKey || undefined
      }
    })
    logActivity(
      apiKey ? `buddy-api-key-set-${provider}` : `buddy-api-key-cleared-${provider}`
    )
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
