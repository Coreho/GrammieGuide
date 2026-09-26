import { ipcMain, app } from 'electron'
import { getConfig } from '../config/store'
import { getReliabilityLog } from '../services/reliability/reliabilityLog'
import { enforceVolumeCeiling } from '../services/reliability/volumeEnforcer'
import { discoverWifiAdapterName } from '../services/reliability/wifiHealer'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'
import { registerSystemTasks, resourcesDir } from '../services/reliability/kioskServices'
import { requireAdminUnlocked } from './requireAdminUnlocked'

export function registerReliabilityIpc(): void {
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
      return logReliabilityEvent({ op: 'system-tasks-check', ok: false, detail: 'only available in the installed app' })
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
