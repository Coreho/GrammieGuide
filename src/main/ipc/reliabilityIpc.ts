import { ipcMain, app } from 'electron'
import { join } from 'path'
import { getConfig } from '../config/store'
import { getReliabilityLog } from '../services/reliability/reliabilityLog'
import { enforceVolumeCeiling } from '../services/reliability/volumeEnforcer'
import { discoverWifiAdapterName } from '../services/reliability/wifiHealer'
import { requireAdminUnlocked } from './requireAdminUnlocked'

export function registerReliabilityIpc(): void {
  ipcMain.handle('reliability:getLog', (_e, req: { limit?: number } = {}) => {
    requireAdminUnlocked()
    return getReliabilityLog(req?.limit)
  })

  ipcMain.handle('reliability:testVolume', async () => {
    requireAdminUnlocked()
    const cfg = getConfig()
    await enforceVolumeCeiling(cfg.display.volumeCeiling, join(app.getAppPath(), 'resources'))
    const [latest] = getReliabilityLog(1)
    return latest
  })

  ipcMain.handle('reliability:testWifiDiscovery', async () => {
    requireAdminUnlocked()
    await discoverWifiAdapterName()
    const [latest] = getReliabilityLog(1)
    return latest
  })
}
