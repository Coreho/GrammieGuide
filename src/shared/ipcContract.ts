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

export type WeatherCategory = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

export type WeatherSnapshot = {
  locationLabel: string
  resolvedName: string
  temp: number
  unit: 'F' | 'C'
  condition: string
  icon: string
  category: WeatherCategory
  feelsLike: number
  humidity: number
  windSpeed: number
  high: number | null
  low: number | null
  hourly: WeatherHourEntry[]
}

export type BuddyChatTurn = { role: 'user' | 'assistant'; text: string }

/**
 * `reply` is always something safe to show grandma - even on failure the
 * main process supplies a calm, non-technical line, so the renderer never
 * has to invent error copy. `reason` is for logging/tests only.
 */
export type BuddyChatResult =
  | { ok: true; reply: string }
  | { ok: false; reason: 'no-key' | 'unavailable' | 'declined'; reply: string }

/** Base64 MP3 of Buddy's line, or why there's none (the renderer then uses the Windows voice). */
export type BuddySpeakResult =
  | { ok: true; audioBase64: string; mime: 'audio/mpeg' }
  | { ok: false; reason: 'disabled' | 'empty' | 'unavailable' }

/**
 * What the microphone heard. Like BuddyChatResult, failures carry no
 * technical text for the renderer to show - the panel has its own calm line
 * for each reason.
 */
export type BuddyListenResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'nothing-heard' | 'no-mic' | 'unavailable' }

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
  /** Empty string clears the key. Write-only: the key is never read back to any renderer. */
  'admin:setApiKey': { request: { apiKey: string }; response: { ok: boolean } }

  'buddy:chat': { request: { turns: BuddyChatTurn[] }; response: BuddyChatResult }
  /** Online (Edge) voice. `voice` overrides the configured one - the admin panel's "Try this voice". */
  'buddy:speak': { request: { text: string; voice?: string }; response: BuddySpeakResult }
  /** One spoken phrase through Windows' offline recognizer; returns once she pauses. */
  'buddy:listen': { request: void; response: BuddyListenResult }
  /** Whether there's a recognizer and a microphone at all, so the panel can hide its mic button. */
  'buddy:canListen': { request: void; response: boolean }

  'display:setFontStep': { request: { step: number }; response: PublicConfig }

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
  /** Pushed to the launcher whenever config changes, so admin edits show up live. */
  'config:changed': PublicConfig
}

export type IpcEventName = keyof IpcEvents
