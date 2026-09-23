import { ipcMain } from 'electron'
import { getConfig, setConfig } from '../config/store'
import { getReliabilityLog } from '../services/reliability/reliabilityLog'
import { enforceVolumeCeiling } from '../services/reliability/volumeEnforcer'
import { discoverWifiAdapterName } from '../services/reliability/wifiHealer'
import { app } from 'electron'
import { join } from 'path'

/**
 * Composes every IPC domain into one registration call. Replaces the old
 * app's pattern of one 1154-line ipc.js registering ~40 handlers inline -
 * each domain gets its own module as more channels are added (see
 * shared/ipcContract.ts for the full planned surface).
 */
export function registerAllIpc(): void {
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, patch) => setConfig(patch))

  ipcMain.handle('reliability:getLog', (_e, req: { limit?: number } = {}) =>
    getReliabilityLog(req?.limit)
  )

  ipcMain.handle('reliability:testVolume', async () => {
    const cfg = getConfig()
    await enforceVolumeCeiling(cfg.display.volumeCeiling, join(app.getAppPath(), 'resources'))
    const [latest] = getReliabilityLog(1)
    return latest
  })

  ipcMain.handle('reliability:testWifiDiscovery', async () => {
    await discoverWifiAdapterName()
    const [latest] = getReliabilityLog(1)
    return latest
  })
}
