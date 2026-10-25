import type { Config, PublicConfig } from './configSchema'
import type { NewsResult } from './news/types'
import type { BuddyCommand } from './buddy/commands'
import type { ChatGptState } from './buddy/chatGpt'
import type { PageOutcome, PageProblem } from './browser/loadFailure'
import type { LibraryEntry, LibraryMetadata, LibraryRequest } from './media/libraryTypes'
import type { Photo, PhotoPatch, PhotoImportResult, PhotoImportProgress } from './media/photoTypes'
import type { MusicTrack, MusicImportResult, MusicImportProgress } from './music/musicTypes'
import type { MusicSettings } from './music/musicSchema'
import type { AudioUpdate, ClientAudioEvent } from './audio/audioContract'
import type {
  BuddyActionRequest,
  BuddyActionPlan,
  BuddyActionResult,
  BuddyTileChoice
} from './buddy/actions'
import type {
  CheckId,
  CheckResults,
  CheckRunResult,
  VoiceReport,
  VoiceStart
} from './checks/caregiverChecks'
import type { BuiltinGameKey } from './games/gamesSchema'
import type { ContactRequestSummary, HomeContactState } from './contacts'
import type { ContactSetup, ContactCredentials, AdminContactSetup } from './contactSettings'
import type { WhatsAppCallState, WhatsAppCommand, WhatsAppCommandResult } from './whatsAppCalls'

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
  | { ok: true; reply: string; action?: BuddyActionPlan }
  | {
      ok: false
      reason: 'disabled' | 'not-connected' | 'unavailable' | 'declined'
      reply: string
      choices?: BuddyTileChoice[]
    }

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
  'whatsapp:state': { request: void; response: WhatsAppCallState }
  'whatsapp:command': { request: WhatsAppCommand; response: WhatsAppCommandResult }
  'chatgpt:state': { request: void; response: ChatGptState }
  'chatgpt:connect': { request: { id?: string }; response: ChatGptState }
  'chatgpt:cancel': { request: void; response: ChatGptState }
  'chatgpt:select': { request: { id: string }; response: ChatGptState }
  'chatgpt:models': { request: void; response: ChatGptState }
  'chatgpt:test': { request: { model: string }; response: ChatGptState }
  'chatgpt:welcome': { request: void; response: ChatGptState }
  'chatgpt:signOut': { request: void; response: ChatGptState }
  'chatgpt:usage': { request: void; response: void }
  'contacts:list': { request: void; response: ContactRequestSummary[] }
  'contacts:home': { request: void; response: HomeContactState }
  'contacts:request': { request: void; response: HomeContactState }
  'contacts:getSettings': { request: void; response: AdminContactSetup }
  'contacts:saveSettings': { request: ContactSetup; response: AdminContactSetup }
  'admin:setContactCredentials': { request: ContactCredentials | null; response: { ok: true } }
  'photos:recordNarration': {
    request: { id: string; bytes: Uint8Array }
    response: Photo['narration'] | null
  }
  'photos:attachNarration': { request: { id: string }; response: Photo['narration'] | null }
  'photos:removeNarration': { request: { id: string }; response: null }
  'photos:setNarrationAutoPlay': {
    request: { id: string; enabled: boolean }
    response: Photo['narration'] | null
  }
  'audio:get': { request: void; response: AudioUpdate }
  'audio:resetOwner': { request: void; response: AudioUpdate }
  'audio:event': { request: ClientAudioEvent; response: AudioUpdate }
  'music:getPlaylists': {
    request: void
    response: { tracks: MusicTrack[]; settings: MusicSettings }
  }
  'music:report': {
    request: { event: 'play' | 'stop' | 'autostop'; playlistId: string }
    response: boolean
  }
  'music:list': { request: void; response: { tracks: MusicTrack[]; settings: MusicSettings } }
  'music:importFiles': { request: void; response: MusicImportResult }
  'music:saveSettings': { request: MusicSettings; response: MusicSettings }
  'music:removeTrack': { request: { id: string }; response: boolean }
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
  'photos:listVisible': { request: void; response: Photo[] }
  'photos:listAll': { request: void; response: Photo[] }
  /** Open the viewer, record only that action, and return caregiver-approved photos. */
  'photos:open': { request: void; response: Photo[] }
  'photos:import': { request: void; response: PhotoImportResult }
  'photos:update': { request: { id: string; patch: PhotoPatch }; response: Photo }
  'photos:remove': { request: { id: string }; response: boolean }
  /** Only photos explicitly chosen for saved Home tiles, without captions or paths. */
  'photos:tileImages': { request: void; response: Record<string, string> }
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
  'news:open': {
    request: { tileId: string; storyId?: string; sourceId?: string }
    response: { ok: boolean }
  }
  'news:preview': {
    request: { tileId: string; sourceId: string }
    response: import('./news/sources').NewsPreview
  }
  'tile:openApp': { request: { id: string }; response: { ok: boolean } }
  'games:openInstalled': { request: { id: string }; response: { ok: boolean } }
  'games:reportBuiltin': { request: { game: BuiltinGameKey }; response: boolean }
  'buddy:command': { request: BuddyCommand; response: { ok: boolean } }
  'config:get': { request: void; response: PublicConfig }
  'config:set': { request: Partial<Config>; response: PublicConfig }

  'reliability:getLog': { request: { limit?: number }; response: ReliabilityEvent[] }
  'reliability:testVolume': { request: void; response: ReliabilityEvent }
  'reliability:testWifiDiscovery': { request: void; response: ReliabilityEvent }
  'reliability:testWatchdogRegistration': { request: void; response: ReliabilityEvent }

  /** The caregiver's checks (admin-only in main); every result says when it was observed. */
  'checks:list': { request: void; response: CheckResults }
  'checks:run': { request: { id: Exclude<CheckId, 'voice'> }; response: CheckRunResult }
  'checks:cancel': { request: { id?: CheckId }; response: CheckResults }
  'checks:voiceStart': { request: void; response: VoiceStart }
  'checks:voiceReport': { request: { runId: number; report: VoiceReport }; response: CheckResults }

  'activity:get': { request: { limit?: number }; response: ActivityEvent[] }

  'admin:isPinSet': { request: void; response: boolean }
  'admin:setPin': {
    request: { newPin: string; currentPin?: string }
    response: { ok: boolean; reason?: string }
  }
  'admin:unlock': { request: { pin: string }; response: { ok: boolean; reason?: string } }
  'admin:lock': { request: void; response: void }
  'admin:isUnlocked': { request: void; response: boolean }
  'admin:previewOldLauncherImport': { request: void; response: OldLauncherImportPreview }
  'admin:applyOldLauncherImport': { request: void; response: { ok: boolean } }

  'buddy:chat': { request: { turns: BuddyChatTurn[] }; response: BuddyChatResult }
  'buddy:action': { request: BuddyActionRequest; response: BuddyActionResult }
  'buddy:cancelListen': { request: void; response: void }
  /** Buddy opening a saved web tile by ID; resolves once the page loads or fails. */
  'browser:openTile': { request: { tileId: string }; response: PageOutcome }
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
  'browser:readerMode': { request: 'article' | 'page'; response: boolean }
  'browser:videoCommand': {
    request: import('./browser/videoControls').VideoCommand
    response: boolean
  }
  /** Caregiver-only, bounded domain history; never full addresses. */
  'browser:blockedSites': { request: void; response: string[] }
  'browser:goBack': { request: void; response: void }
  /** Her "Try again" on the recovery screen: reload the page that failed. */
  'browser:retry': { request: void; response: void }
  /** Her "Back to the page" after a blocked link. */
  'browser:dismissBlocked': { request: void; response: void }
  /** Home opening the caregiver's recovery check page. It carries no address: main chose it. */
  'browser:openRecoveryCheck': { request: void; response: { ok: boolean } }
}

export type IpcChannel = keyof IpcApi
export type IpcRequest<C extends IpcChannel> = IpcApi[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcApi[C]['response']

/**
 * Main -> renderer push events (not request/response). Kept separate from
 * IpcApi since these are ipcRenderer.on subscriptions, not invoke() calls.
 */
export interface IpcEvents {
  'whatsapp:changed': WhatsAppCallState
  'browser:reader': import('./news/reader').ReaderState
  'browser:video': import('./browser/videoControls').VideoState
  'audio:changed': AudioUpdate
  'music:importProgress': MusicImportProgress
  'photos:changed': Record<string, never>
  'photos:importProgress': PhotoImportProgress
  'buddy:command': BuddyCommand
  /** The page failed or a link was blocked (Home shows its recovery screen), or null once it's fine again. */
  'browser:page-problem': { kind: PageProblem | null }
  'browser:can-go-back-changed': { canGoBack: boolean }
  'browser:idle-timeout': Record<string, never>
  /** Main closed the page for Home (the recovery check finished); show Home, nothing else. */
  'browser:return-home': Record<string, never>
  'news:return-to-shelf': { tileId: string }
  /** The caregiver's recovery check asks Home to open its page, if Home is showing. */
  'checks:recovery-start': Record<string, never>
  /** Pushed to admin whenever a caregiver check result changes. */
  'checks:changed': CheckResults
  /** Pushed to the launcher whenever config changes, so admin edits show up live. */
  'config:changed': PublicConfig
}

export type IpcEventName = keyof IpcEvents
