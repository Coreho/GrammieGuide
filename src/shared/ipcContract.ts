import type { Config, PublicConfig } from './configSchema'

/**
 * Single source of truth for every IPC channel: name, request payload, and
 * response type. Both main (src/main/ipc/*) and preload (src/preload/*)
 * import from here, so a renamed/removed channel is a compile error in both
 * places instead of a silent runtime `undefined` - the old app's ipc.js and
 * its preloads duplicated ~40 channel names independently with no link
 * between them.
 */

export type ReliabilityEvent = {
  ts: string
  op: string
  ok: boolean
  detail?: string
  durationMs?: number
}

export type ActivityEvent = {
  ts: string
  type: string
  detail?: string
}

export type WeatherHourEntry = {
  label: string
  temp: number
  icon: string
}

export type WeatherSnapshot = {
  locationLabel: string
  resolvedName: string
  temp: number
  unit: 'F' | 'C'
  condition: string
  icon: string
  feelsLike: number
  humidity: number
  windSpeed: number
  high: number | null
  low: number | null
  hourly: WeatherHourEntry[]
}

export interface IpcApi {
  'config:get': { request: void; response: PublicConfig }
  'config:set': { request: Partial<Config>; response: PublicConfig }

  'reliability:getLog': { request: { limit?: number }; response: ReliabilityEvent[] }
  'reliability:testVolume': { request: void; response: ReliabilityEvent }
  'reliability:testWifiDiscovery': { request: void; response: ReliabilityEvent }
  'reliability:testWatchdogRegistration': { request: void; response: ReliabilityEvent }

  'activity:get': { request: { limit?: number }; response: ActivityEvent[] }

  'admin:isPinSet': { request: void; response: boolean }
  'admin:setPin': { request: { newPin: string; currentPin?: string }; response: { ok: boolean; reason?: string } }
  'admin:unlock': { request: { pin: string }; response: { ok: boolean; reason?: string } }
  'admin:lock': { request: void; response: void }
  'admin:isUnlocked': { request: void; response: boolean }
  'admin:hasApiKey': { request: void; response: boolean }

  'display:setFontScale': { request: { fontScale: number }; response: PublicConfig }

  'weather:get': { request: { label: string; units: 'imperial' | 'metric' }; response: WeatherSnapshot | null }

  'browser:open': { request: { url: string }; response: { ok: boolean; reason?: string } }
  'browser:goHome': { request: void; response: void }
  'browser:goBack': { request: void; response: void }
}

export type IpcChannel = keyof IpcApi
export type IpcRequest<C extends IpcChannel> = IpcApi[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcApi[C]['response']

/**
 * Main -> renderer push events (not request/response). Kept separate from
 * IpcApi since these are ipcRenderer.on subscriptions, not invoke() calls.
 */
export interface IpcEvents {
  'browser:blocked': { url: string }
  'browser:can-go-back-changed': { canGoBack: boolean }
  'browser:idle-timeout': Record<string, never>
}

export type IpcEventName = keyof IpcEvents
