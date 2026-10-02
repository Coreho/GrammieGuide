import type { Config, PublicConfig } from './configSchema'
import type { NewsResult } from './news/types'
import type { BuddyCommand } from './buddy/commands'
import type { PageProblem } from './browser/loadFailure'
import type { LibraryEntry, LibraryMetadata, LibraryRequest } from './media/libraryTypes'

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
  | { ok: false; reason: 'disabled' | 'no-key' | 'unavailable' | 'declined'; reply: string }

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
  { ok: true; text: string } | { ok: false; reason: 'nothing-heard' | 'no-mic' | 'unavailable' }

/**
 * What "Import settings from Grandma's Launcher" would bring over, shown to
 * the caregiver before applying. Settings only: tiles are set up fresh.
 */
export type OldLauncherImportPreview =
  | { found: false }
  | {
      found: true
      /** Human-readable settings that would change. */
      settings: string[]
      notImported: string[]
    }

export interface IpcApi {
  'backup:save': {
    request: void
    response: { ok: true } | { ok: false; canceled: true } | { ok: false; message: string }
  }
  'backup:restore': {
    request: void
    response:
      | { ok: true; config: PublicConfig }
      | { ok: false; canceled: true }
      | { ok: false; message: string }
  }
  'library:list': { request: LibraryRequest; response: LibraryEntry[] }
  'library:import': { request: LibraryRequest; response: LibraryEntry[] }
  'library:update': {
    request: LibraryRequest & { id: string; patch: LibraryMetadata }
    response: LibraryEntry
  }
  'library:remove': { request: LibraryRequest & { id: string }; response: boolean }
  // News takes a tile id, never a URL: main fetches only the feed the caregiver
  // saved, and opens only that site or a story it served (see newsIpc.ts).
  'news:get': { request: { tileId: string }; response: NewsResult }
  'news:open': { request: { tileId: string; storyId?: string }; response: { ok: boolean } }
  'tile:openApp': { request: { id: string }; response: { ok: boolean } }
  'buddy:command': { request: BuddyCommand; response: { ok: boolean } }
  'config:get': { request: void; response: PublicConfig }
  'config:set': { request: Partial<Config>; response: PublicConfig }

  'reliability:getLog': { request: { limit?: number }; response: ReliabilityEvent[] }
  'reliability:testVolume': { request: void; response: ReliabilityEvent }
  'reliability:testWifiDiscovery': { request: void; response: ReliabilityEvent }
  'reliability:testWatchdogRegistration': { request: void; response: ReliabilityEvent }

  'activity:get': { request: { limit?: number }; response: ActivityEvent[] }

  'admin:isPinSet': { request: void; response: boolean }
  'admin:setPin': {
    request: { newPin: string; currentPin?: string }
    response: { ok: boolean; reason?: string }
  }
  'admin:unlock': { request: { pin: string }; response: { ok: boolean; reason?: string } }
  'admin:lock': { request: void; response: void }
  'admin:isUnlocked': { request: void; response: boolean }
  'admin:hasApiKey': { request: void; response: boolean }
  /** Empty string clears the key. Write-only: the key is never read back to any renderer. */
  'admin:setApiKey': { request: { apiKey: string }; response: { ok: boolean } }
  'admin:previewOldLauncherImport': { request: void; response: OldLauncherImportPreview }
  'admin:applyOldLauncherImport': { request: void; response: { ok: boolean } }

  'buddy:chat': { request: { turns: BuddyChatTurn[] }; response: BuddyChatResult }
  /** Online (Edge) voice. `voice` overrides the configured one - the admin panel's "Try this voice". */
  'buddy:speak': { request: { text: string; voice?: string }; response: BuddySpeakResult }
  /** One spoken phrase through Windows' offline recognizer; returns once she pauses. */
  'buddy:listen': { request: void; response: BuddyListenResult }
  /** Whether there's a recognizer and a microphone at all, so the panel can hide its mic button. */
  'buddy:canListen': { request: void; response: boolean }

  'weather:get': {
    request: { label: string; units: 'imperial' | 'metric' }
    response: WeatherSnapshot | null
  }

  'browser:open': { request: { url: string }; response: { ok: boolean; reason?: string } }
  'browser:goHome': { request: void; response: void }
  'browser:goBack': { request: void; response: void }
  /** Her "Try again" on the recovery screen: reload the page that failed. */
  'browser:retry': { request: void; response: void }
  /** Her "Back to the page" after a blocked link. */
  'browser:dismissBlocked': { request: void; response: void }
}

export type IpcChannel = keyof IpcApi
export type IpcRequest<C extends IpcChannel> = IpcApi[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcApi[C]['response']

/**
 * Main -> renderer push events (not request/response). Kept separate from
 * IpcApi since these are ipcRenderer.on subscriptions, not invoke() calls.
 */
export interface IpcEvents {
  'buddy:command': BuddyCommand
  'browser:blocked': { url: string }
  /** The page failed or a link was blocked (Home shows its recovery screen), or null once it's fine again. */
  'browser:page-problem': { kind: PageProblem | null }
  'browser:can-go-back-changed': { canGoBack: boolean }
  'browser:idle-timeout': Record<string, never>
  /** Pushed to the launcher whenever config changes, so admin edits show up live. */
  'config:changed': PublicConfig
}

export type IpcEventName = keyof IpcEvents
