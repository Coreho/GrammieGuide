import { ipcMain, app } from 'electron'
import { getConfig } from '../config/store'
import { getReliabilityLog } from '../services/reliability/reliabilityLog'
import { enforceVolumeCeiling } from '../services/reliability/volumeEnforcer'
import { discoverWifiAdapterName } from '../services/reliability/wifiHealer'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'
import {
  getNetworkStatus,
  registerSystemTasks,
  resourcesDir
} from '../services/reliability/kioskServices'
import { getHealthStore, readSafetyEvents } from '../services/health/healthStore'
import { getContactRequests } from '../services/contacts/contactRuntime'
import type { HealthSummary } from '@shared/health/healthRecord'
import { requireAdminUnlocked } from './requireAdminUnlocked'

/** Her own callback requests that failed; caregiver test texts are reported in Contacts instead. */
async function failedHelpRequests(): Promise<number[] | null> {
  try {
    return (await getContactRequests().list())
      .filter((request) => request.purpose === 'real' && request.status === 'failed')
      .map((request) => request.updatedAt)
  } catch {
    return null
  }
}

export function registerReliabilityIpc(): void {
  ipcMain.handle('health:get', async (): Promise<HealthSummary> => {
    requireAdminUnlocked()
    const store = getHealthStore()
    if (!store) throw new Error('The status history is not available.')
    return store.summary({
      network: getNetworkStatus(),
      safetyEvents: readSafetyEvents(app.getPath('userData')),
      failedHelpRequests: await failedHelpRequests()
    })
  })

  ipcMain.handle('reliability:getLog', (_e, req: { limit?: number } = {}) => {
    requireAdminUnlocked()
    return getReliabilityLog(req?.limit)
  })

  ipcMain.handle('reliability:testVolume', async () => {
    requireAdminUnlocked()
    const cfg = getConfig()
    await enforceVolumeCeiling(cfg.display.volumeCeiling, resourcesDir())
    const [latest] = getReliabilityLog(1)
    return latest
  })

  ipcMain.handle('reliability:testWatchdogRegistration', async () => {
    requireAdminUnlocked()
    if (!app.isPackaged) {
      // Registering from a dev run would point Windows at electron.exe.
      return logReliabilityEvent({
        op: 'system-tasks-check',
        ok: false,
        detail: 'only available in the installed app'
      })
    }
    const ok = await registerSystemTasks({ force: true })
    return logReliabilityEvent({
      op: 'system-tasks-check',
      ok,
      detail: ok ? 'autostart and watchdog tasks registered' : 'see the entries above'
    })
  })

  ipcMain.handle('reliability:testWifiDiscovery', async () => {
    requireAdminUnlocked()
    await discoverWifiAdapterName()
    const [latest] = getReliabilityLog(1)
    return latest
  })
}
