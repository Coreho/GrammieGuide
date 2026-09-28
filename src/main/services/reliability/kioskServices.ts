import { app } from 'electron'
import { join } from 'path'
import { getConfig, setConfig } from '../../config/store'
import { logActivity } from '../activityLog/activityLog'
import { logReliabilityEvent } from './reliabilityLog'
import { enforceVolumeCeiling } from './volumeEnforcer'
import { resolveWifiAdapterName, restartWifiAdapter } from './wifiHealer'
import { CHECK_INTERVAL_MS, INITIAL_WIFI_STATE, decideWifi, isOnline, type WifiWatchState } from './wifiWatch'
import { clearQuitFlag, registerAutostartTask, registerWatchdogTask } from './watchdog'

/**
 * Turns M1's reliability pieces on in the running app. Until this existed
 * they were only reachable from the admin panel's test buttons: nothing
 * started the kiosk at login, registered the watchdog, held the volume
 * ceiling or healed Wi-Fi - all things the old app did on its own.
 */

const VOLUME_INTERVAL_MS = 30_000

/** Where extraResources land: next to app.asar when installed, the repo's resources/ in dev. */
export function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

/**
 * System-level registration (autostart + watchdog) only happens in the
 * installed app: in dev or under E2E it would point Windows at electron.exe
 * and relaunch it forever on the developer's own machine.
 */
export function shouldRegisterSystemTasks(): boolean {
  return app.isPackaged && process.env['GRAMMIEGUIDE_E2E'] !== '1'
}

/**
 * On every start the tasks are re-registered (so paths stay right after an
 * update) but a disabled one is left disabled; `force` (the admin panel's
 * button) re-enables it.
 */
export async function registerSystemTasks(opts: { force?: boolean } = {}): Promise<boolean> {
  const exe = process.execPath
  const userData = app.getPath('userData')
  const keep = { keepDisabled: !opts.force }
  const [autostart, watchdog] = await Promise.all([
    registerAutostartTask(exe, undefined, keep),
    registerWatchdogTask(join(resourcesDir(), 'watchdog', 'watchdog.ps1'), join(userData, 'heartbeat.txt'), exe, undefined, keep)
  ])
  return autostart && watchdog
}

const timers: NodeJS.Timeout[] = []

export function startKioskServices(): void {
  // Starting at all means the watchdog should look after us again.
  clearQuitFlag(app.getPath('userData'))

  if (shouldRegisterSystemTasks()) void registerSystemTasks()

  const holdVolume = (): void => {
    void enforceVolumeCeiling(getConfig().display.volumeCeiling, resourcesDir(), undefined, { quiet: true }).catch((err) =>
      logReliabilityEvent({ op: 'volume-enforce', ok: false, detail: String(err) })
    )
  }
  holdVolume()
  timers.push(setInterval(holdVolume, VOLUME_INTERVAL_MS))

  let wifi: WifiWatchState = INITIAL_WIFI_STATE
  let checking = false
  const checkWifi = async (): Promise<void> => {
    if (checking) return
    checking = true
    try {
      const decision = decideWifi(wifi, await isOnline(), Date.now())
      wifi = decision.state
      if (decision.transition === 'lost') logActivity('network-lost')
      if (decision.transition === 'restored') logActivity('network-restored')
      if (decision.restart) await healWifi()
    } finally {
      checking = false
    }
  }
  timers.push(setInterval(() => void checkWifi(), CHECK_INTERVAL_MS))
}

async function healWifi(): Promise<void> {
  const cached = getConfig().reliability.wifiAdapterName
  const name = await resolveWifiAdapterName(cached)
  if (!name) {
    // Wired-only machine (or no adapter found): nothing to restart.
    logReliabilityEvent({ op: 'wifi-heal', ok: false, detail: 'offline, but no Wi-Fi adapter found to restart' })
    return
  }
  logActivity('wifi-restart-triggered', 'offline for over a minute')
  const ok = await restartWifiAdapter(name)
  if (ok && name !== cached) {
    // Remember it; setConfig merges one level deep, so carry the rest of
    // reliability (the PIN hash and salt live there) forward.
    setConfig({ reliability: { ...getConfig().reliability, wifiAdapterName: name } })
  }
  if (!ok && cached) {
    // A cached name that no longer restarts may be stale (renamed adapter,
    // driver reinstall): forget it so the next attempt re-discovers.
    setConfig({ reliability: { ...getConfig().reliability, wifiAdapterName: undefined } })
  }
}

export function stopKioskServices(): void {
  for (const t of timers.splice(0)) clearInterval(t)
}
