import { ipcMain } from 'electron'
import { getConfig, setConfig } from '../config/store'
import { toPublicConfig, type Config } from '@shared/configSchema'
import { FONT_STEP_COUNT } from '@shared/theme'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { logActivity } from '../services/activityLog/activityLog'

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', () => toPublicConfig(getConfig()))

  ipcMain.handle('config:set', (_e, patch: Partial<Config>) => {
    requireAdminUnlocked()
    // adminPinHash/Salt may only change via admin:setPin's hashing flow -
    // never accept them directly through the generic config writer.
    const sanitized: Partial<Config> = { ...patch }
    if (sanitized.reliability) {
      const { adminPinHash: _h, adminPinSalt: _s, ...rest } = sanitized.reliability
      sanitized.reliability = rest
    }
    logActivity('config-updated', Object.keys(sanitized).join(','))
    return toPublicConfig(setConfig(sanitized))
  })

  ipcMain.handle('display:setFontStep', (_e, req: { step: number }) => {
    const clamped = Math.min(FONT_STEP_COUNT - 1, Math.max(0, Math.round(req.step)))
    return toPublicConfig(setConfig({ display: { ...getConfig().display, fontStep: clamped } }))
  })
}
