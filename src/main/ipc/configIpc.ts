import { ipcMain } from 'electron'
import { getConfig, setConfig } from '../config/store'
import { toPublicConfig, mergeAdminPatch, type Config } from '@shared/configSchema'
import { FONT_STEP_COUNT } from '@shared/theme'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { logActivity } from '../services/activityLog/activityLog'
import { getLauncherWindow } from '../windows/windowManager'

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', () => toPublicConfig(getConfig()))

  ipcMain.handle('config:set', (_e, patch: Partial<Config>) => {
    requireAdminUnlocked()
    // Secrets (API key, PIN hash/salt) only change via their own admin:*
    // channels - never set or cleared through the generic config writer.
    const sanitized = mergeAdminPatch(getConfig(), patch)
    logActivity('config-updated', Object.keys(sanitized).join(','))
    const updated = toPublicConfig(setConfig(sanitized))
    // The launcher only reads config on mount - push admin edits to it so
    // a new tile or theme shows up on her screen without a restart.
    getLauncherWindow()?.webContents.send('config:changed', updated)
    return updated
  })

  ipcMain.handle('display:setFontStep', (_e, req: { step: number }) => {
    const clamped = Math.min(FONT_STEP_COUNT - 1, Math.max(0, Math.round(req.step)))
    return toPublicConfig(setConfig({ display: { ...getConfig().display, fontStep: clamped } }))
  })
}
