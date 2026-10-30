/**
 * The caregiver's "does it actually work on her computer?" checks. The SeniorsUI
 * comparison found a test label that hid an incomplete path, so every result
 * here says exactly what was observed: a voice that finished playing is not a
 * voice somebody heard, and an earlier pass is shown with its time, never as
 * "working now".
 */

export const CHECK_IDS = ['voice', 'microphone', 'connectivity', 'browserRecovery'] as const
export type CheckId = (typeof CHECK_IDS)[number]

/**
 * `played` exists only for the voice: playback finished and the caregiver has
 * not yet said whether they heard it. It is never a pass.
 */
export type CheckStatus = 'checking' | 'played' | 'passed' | 'failed' | 'unavailable' | 'cancelled'

export type CheckResult = {
  status: CheckStatus
  /** Plain words for the caregiver. Never contains what anybody said. */
  message: string
  /** When this result was observed (ms since epoch). */
  checkedAt: number
}

export type CheckResults = Partial<Record<CheckId, CheckResult>>

export function isCheckId(value: unknown): value is CheckId {
  return typeof value === 'string' && (CHECK_IDS as readonly string[]).includes(value)
}

/** Which voice path the voice check used, so a fallback is never passed off as the chosen voice. */
export type VoicePath = 'online' | 'local' | 'windows'

/**
 * What the panel reports back about the voice it played: playback finished,
 * playback failed, no Windows voice exists, then the caregiver's own answer.
 */
export const VOICE_REPORTS = [
  'played',
  'playback-failed',
  'unavailable',
  'heard',
  'not-heard'
] as const
export type VoiceReport = (typeof VOICE_REPORTS)[number]

export function isVoiceReport(value: unknown): value is VoiceReport {
  return typeof value === 'string' && (VOICE_REPORTS as readonly string[]).includes(value)
}

/** How the panel should play the voice check: the audio main made, or the Windows voice. */
export type VoiceStart =
  | { runId: number; kind: 'audio'; audioBase64: string; mime: string }
  | { runId: number; kind: 'windows'; fallback: boolean }
  | { runId: number; kind: 'cancelled' }

/** `heard` is shown once to the caregiver who just spoke; it is never stored or logged. */
export type CheckRunResult = { results: CheckResults; heard?: string }

export const CHECK_LABELS: Record<CheckId, string> = {
  voice: "Buddy's voice",
  microphone: 'Microphone',
  connectivity: 'Internet connection',
  browserRecovery: 'Getting back Home from a broken page'
}

export const CHECK_MESSAGES = {
  voiceChecking: 'Getting the voice ready...',
  voicePlayedOnline: "Buddy's online voice finished playing. Did you hear it?",
  voicePlayedLocal:
    "The voice on this computer finished playing (Buddy's online voice is off). Did you hear it?",
  voicePlayedLocalFallback:
    "Buddy's online voice isn't working right now, so this used the voice on this computer instead. Did you hear it?",
  voicePlayedWindows:
    "The voice on this computer isn't available, so this used the Windows voice instead. Did you hear it?",
  voicePlayedFallback:
    'Neither the online voice nor the voice on this computer is working right now, so this used the Windows voice instead. Did you hear it?',
  voiceHeard: 'You heard Buddy speak.',
  voiceNotHeard:
    "Buddy's voice played, but you didn't hear it. Check the volume and which speaker Windows is using.",
  voicePlaybackFailed: "Buddy's voice couldn't play on this computer.",
  voiceUnavailable: "No voice is available on this computer, so Buddy can't speak out loud.",
  micChecking: 'Listening... say a short sentence now.',
  micHeard: 'The microphone heard you.',
  micNothing: "The microphone didn't hear anything. Speak right after pressing the button.",
  micNoMic: 'No microphone was found.',
  micUnavailable: "Speech recognition isn't available on this computer.",
  netChecking: 'Checking the internet connection...',
  netOk: 'Connected to the internet.',
  netOffline: "Windows says this computer isn't connected to a network.",
  netUnreachable: "Connected to a network, but the internet can't be reached.",
  netPortal: 'Connected, but a sign-in page is blocking the internet.',
  recoveryChecking: "Showing the 'page didn't load' screen on Home for a moment...",
  recoveryOk:
    "A page that couldn't load showed the friendly 'page didn't load' screen, and Home came back.",
  recoveryNoScreen:
    "The 'page didn't load' screen didn't appear, so she could be left looking at a broken page.",
  recoveryNotClosed: "The broken page didn't close when Home was asked for.",
  recoveryPageOpen:
    'A web page is open on Home right now. Try again when Home is showing, so her page is not closed.',
  recoveryHomeBusy:
    'Home is busy (something is open on her screen). Try again when Home is showing.',
  recoveryNoHome: "Home isn't running, so this can't be checked.",
  cancelled: 'Stopped before it finished.',
  failed: "This check couldn't finish."
} as const

/** Older than this, the panel reminds the caregiver that a result is history, not the present. */
export const RESULT_STALE_MS = 10 * 60_000

/** "Checked 2:14 PM (5 minutes ago)". The time is always shown, whatever the status. */
export function describeCheckedAt(checkedAt: number, now: number): string {
  const time = new Date(checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const minutes = Math.floor(Math.max(0, now - checkedAt) / 60_000)
  const ago = minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  return `Checked ${time} (${ago})`
}

export function isStale(result: CheckResult, now: number): boolean {
  return result.status !== 'checking' && now - result.checkedAt >= RESULT_STALE_MS
}
