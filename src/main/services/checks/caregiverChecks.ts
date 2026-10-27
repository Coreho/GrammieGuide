import type { BuddyListenResult, BuddySpeakResult } from '@shared/ipcContract'
import type { PageProblem } from '@shared/browser/loadFailure'
import {
  CHECK_MESSAGES as M,
  type CheckId,
  type CheckResults,
  type CheckRunResult,
  type CheckStatus,
  type VoicePath,
  type VoiceReport,
  type VoiceStart
} from '@shared/checks/caregiverChecks'

/**
 * The caregiver's checks, run on her actual computer. Results live in memory
 * only: after a restart nothing is shown as checked, so a pass can never
 * outlive the run it was observed in. TASK-25's health record can read the
 * last confirmed sound through lastHeardSound() instead of keeping its own.
 *
 * Every dependency is injected so the outcomes can be tested without Electron,
 * PowerShell, a speaker or a network.
 */

export const VOICE_CHECK_LINE = 'Hello! This is Buddy, checking that you can hear me.'
/** Windows' own connectivity probe (NCSI): a fixed address, a fixed reply. */
export const CONNECTIVITY_URL = 'http://www.msftconnecttest.com/connecttest.txt'
export const CONNECTIVITY_REPLY = 'Microsoft Connect Test'
export const CONNECTIVITY_TIMEOUT_MS = 8_000
/** How long Home gets to open the check page; longer means she is busy on another screen. */
export const RECOVERY_OPEN_TIMEOUT_MS = 5_000
/** A refused local connection fails in milliseconds; this is generous. */
export const RECOVERY_PROBLEM_TIMEOUT_MS = 10_000
/** Leaves the recovery screen up long enough for anyone at the kiosk to see it. */
export const RECOVERY_SHOW_MS = 1_500
const POLL_MS = 100

export type CaregiverChecksDeps = {
  now(): number
  sleep(ms: number): Promise<void>
  voiceSettings(): { cloudTtsEnabled: boolean; ttsVoice: string; localVoice: string }
  synthesize(text: string, voice: string): Promise<BuddySpeakResult>
  /** The voice on this computer, waiting for it to load if it must. */
  synthesizeLocal(text: string, voice: string): Promise<BuddySpeakResult>
  listen(signal: AbortSignal): Promise<BuddyListenResult>
  /** Starts a main-owned 'listening' audio hold (music pauses, voices stop); returns its release. */
  holdListening(): () => void
  isOnline(): boolean
  /** Resolves with the body, or rejects on any network failure or abort. */
  fetchText(url: string, signal: AbortSignal): Promise<string>
  /** A local port nothing listens on, so a page load there fails at once without the network. */
  reserveClosedPort(): Promise<number>
  browser: {
    isOpen(): boolean
    problem(): PageProblem | null
    open(url: string): { ok: boolean }
    close(): void
  }
  home: {
    available(): boolean
    /** Asks Home to open the check page itself, the way a tile does, if she is on plain Home. */
    requestRecoveryPage(): void
    /** Tells Home the page was closed for it, so it shows Home again. */
    returnHome(): void
  }
  log(type: string): void
  onChange(results: CheckResults): void
}

type Run = { id: number; controller: AbortController; done: Promise<void> }
type VoiceRun = {
  id: number
  path: VoicePath
  fallback: boolean
  stage: 'started' | 'played' | 'done'
}

export interface CaregiverChecks {
  results(): CheckResults
  cancel(id: CheckId): void
  cancelAll(): void
  lastHeardSound(): { at: number; path: VoicePath } | null
  run(id: Exclude<CheckId, 'voice'>): Promise<CheckRunResult>
  openRecoveryPage(): { ok: boolean }
  startVoice(): Promise<VoiceStart>
  reportVoice(runId: number, report: VoiceReport): CheckResults
}

export function createCaregiverChecks(deps: CaregiverChecksDeps): CaregiverChecks {
  const results: CheckResults = {}
  const runs = new Map<CheckId, Run>()
  let nextRunId = 1
  let voice: VoiceRun | null = null
  let heardSound: { at: number; path: VoicePath } | null = null
  // Exists only while a recovery check runs; per run, so a replaced run unwinding can't clear the new one.
  let recovery: { runId: number; url: string; opened: boolean } | null = null

  function snapshot(): CheckResults {
    return { ...results }
  }

  function set(id: CheckId, runId: number, status: CheckStatus, message: string): void {
    // A cancelled or replaced run must not overwrite what the caregiver now sees.
    const current = id === 'voice' ? voice?.id : runs.get(id)?.id
    if (current !== runId) return
    results[id] = { status, message, checkedAt: deps.now() }
    if (status !== 'checking' && status !== 'played') deps.log(`caregiver-check-${id}-${status}`)
    deps.onChange(snapshot())
  }

  function cancel(id: CheckId): void {
    if (id === 'voice') {
      if (voice && voice.stage !== 'done') {
        // 'done' makes startVoice drop its audio and reportVoice ignore this run.
        voice.stage = 'done'
        results.voice = { status: 'cancelled', message: M.cancelled, checkedAt: deps.now() }
        deps.log('caregiver-check-voice-cancelled')
        deps.onChange(snapshot())
      }
      return
    }
    const run = runs.get(id)
    if (!run) return
    run.controller.abort()
    runs.delete(id)
    results[id] = { status: 'cancelled', message: M.cancelled, checkedAt: deps.now() }
    deps.log(`caregiver-check-${id}-cancelled`)
    deps.onChange(snapshot())
  }

  function cancelAll(): void {
    for (const id of ['voice', ...runs.keys()] as CheckId[]) cancel(id)
  }

  /** Polls until `done()` or the deadline; false on timeout or abort. */
  async function waitFor(
    done: () => boolean,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<boolean> {
    const deadline = deps.now() + timeoutMs
    while (!signal.aborted) {
      if (done()) return true
      if (deps.now() >= deadline) return false
      await deps.sleep(POLL_MS)
    }
    return false
  }

  async function microphone(runId: number, signal: AbortSignal): Promise<string | undefined> {
    set('microphone', runId, 'checking', M.micChecking)
    const release = deps.holdListening()
    try {
      const heard = await deps.listen(signal)
      if (signal.aborted) return undefined
      if (heard.ok) {
        set('microphone', runId, 'passed', M.micHeard)
        // Shown once to the caregiver who just spoke; never stored or logged.
        return heard.text
      }
      if (heard.reason === 'nothing-heard') set('microphone', runId, 'failed', M.micNothing)
      else if (heard.reason === 'no-mic') set('microphone', runId, 'unavailable', M.micNoMic)
      else set('microphone', runId, 'unavailable', M.micUnavailable)
      return undefined
    } finally {
      release()
    }
  }

  async function connectivity(runId: number, signal: AbortSignal): Promise<void> {
    set('connectivity', runId, 'checking', M.netChecking)
    if (!deps.isOnline()) return set('connectivity', runId, 'failed', M.netOffline)
    try {
      const body = await deps.fetchText(
        CONNECTIVITY_URL,
        AbortSignal.any([signal, AbortSignal.timeout(CONNECTIVITY_TIMEOUT_MS)])
      )
      if (signal.aborted) return
      // Anything else came from a hotel/clinic Wi-Fi sign-in page standing in for the internet.
      if (body.trim() === CONNECTIVITY_REPLY) set('connectivity', runId, 'passed', M.netOk)
      else set('connectivity', runId, 'failed', M.netPortal)
    } catch {
      if (!signal.aborted) set('connectivity', runId, 'failed', M.netUnreachable)
    }
  }

  async function browserRecovery(runId: number, signal: AbortSignal): Promise<void> {
    set('browserRecovery', runId, 'checking', M.recoveryChecking)
    if (!deps.home.available())
      return set('browserRecovery', runId, 'unavailable', M.recoveryNoHome)
    // Never close a page she is reading to run a test.
    if (deps.browser.isOpen())
      return set('browserRecovery', runId, 'unavailable', M.recoveryPageOpen)
    const port = await deps.reserveClosedPort()
    if (signal.aborted) return
    const mine = { runId, url: `http://127.0.0.1:${port}/`, opened: false }
    recovery = mine
    try {
      deps.home.requestRecoveryPage()
      if (!(await waitFor(() => mine.opened, RECOVERY_OPEN_TIMEOUT_MS, signal))) {
        if (!signal.aborted) set('browserRecovery', runId, 'unavailable', M.recoveryHomeBusy)
        return
      }
      const shown = await waitFor(
        () => deps.browser.problem() !== null,
        RECOVERY_PROBLEM_TIMEOUT_MS,
        signal
      )
      if (signal.aborted) return
      if (!shown) return set('browserRecovery', runId, 'failed', M.recoveryNoScreen)
      await deps.sleep(RECOVERY_SHOW_MS)
      if (signal.aborted) return
      // The same close her Home button uses (browser:goHome), which also ends the page's sound.
      deps.browser.close()
      deps.home.returnHome()
      if (deps.browser.isOpen()) set('browserRecovery', runId, 'failed', M.recoveryNotClosed)
      else set('browserRecovery', runId, 'passed', M.recoveryOk)
    } finally {
      if (recovery === mine) recovery = null
      // Cancelled, timed out or failed: never leave the check page on her screen.
      // While the check page is up Home is in its browser view, so no other page can have replaced it.
      if (mine.opened && deps.browser.isOpen()) {
        deps.browser.close()
        deps.home.returnHome()
      }
    }
  }

  return {
    results: snapshot,
    cancel,
    cancelAll,
    /** For TASK-25: the last time a caregiver said they heard Buddy, and which voice path it was. */
    lastHeardSound: () => heardSound,

    async run(id: Exclude<CheckId, 'voice'>): Promise<CheckRunResult> {
      const previous = runs.get(id)
      cancel(id)
      // Let a stopped run finish cleaning up (PowerShell killed, check page
      // closed) first, or the new run would find the old page still open.
      await previous?.done
      let finished = (): void => {}
      const run: Run = {
        id: nextRunId++,
        controller: new AbortController(),
        done: new Promise<void>((resolve) => (finished = resolve))
      }
      runs.set(id, run)
      const { signal } = run.controller
      let heard: string | undefined
      try {
        if (id === 'microphone') heard = await microphone(run.id, signal)
        else if (id === 'connectivity') await connectivity(run.id, signal)
        else await browserRecovery(run.id, signal)
      } catch {
        set(id, run.id, 'failed', M.failed)
      } finally {
        if (runs.get(id) === run) runs.delete(id)
        finished()
      }
      return heard === undefined ? { results: snapshot() } : { results: snapshot(), heard }
    },

    /** Called by Home (launcher-only IPC). Opens only the address this check chose. */
    openRecoveryPage(): { ok: boolean } {
      if (!recovery || recovery.opened) return { ok: false }
      const opened = deps.browser.open(recovery.url)
      recovery.opened = opened.ok
      return { ok: opened.ok }
    },

    async startVoice(): Promise<VoiceStart> {
      cancel('voice')
      const runId = nextRunId++
      const { cloudTtsEnabled, ttsVoice, localVoice } = deps.voiceSettings()
      const run: VoiceRun = { id: runId, path: 'windows', fallback: false, stage: 'started' }
      voice = run
      set('voice', runId, 'checking', M.voiceChecking)
      const live = (): boolean => voice === run && run.stage === 'started'
      // The same order Buddy uses on Home: online if it's on, then this
      // computer's voice, then Windows. A fallback is said so, never passed off.
      if (cloudTtsEnabled) {
        const spoken = await deps.synthesize(VOICE_CHECK_LINE, ttsVoice)
        if (!live()) return { runId, kind: 'cancelled' }
        if (spoken.ok) {
          run.path = 'online'
          return { runId, kind: 'audio', audioBase64: spoken.audioBase64, mime: spoken.mime }
        }
        run.fallback = true
      }
      const local = await deps.synthesizeLocal(VOICE_CHECK_LINE, localVoice)
      if (!live()) return { runId, kind: 'cancelled' }
      if (local.ok) {
        run.path = 'local'
        return { runId, kind: 'audio', audioBase64: local.audioBase64, mime: local.mime }
      }
      return { runId, kind: 'windows', fallback: run.fallback }
    },

    /**
     * The panel's account of the voice it played. 'heard' counts only after
     * 'played' for the same run, so a confirmation can't skip playback or land
     * on a newer run.
     */
    reportVoice(runId: number, report: VoiceReport): CheckResults {
      if (!voice || voice.id !== runId || voice.stage === 'done') return snapshot()
      const run = voice
      if (run.stage === 'started' && report === 'played') {
        run.stage = 'played'
        set(
          'voice',
          runId,
          'played',
          run.path === 'online'
            ? M.voicePlayedOnline
            : run.path === 'local'
              ? run.fallback
                ? M.voicePlayedLocalFallback
                : M.voicePlayedLocal
              : run.fallback
                ? M.voicePlayedFallback
                : M.voicePlayedWindows
        )
      } else if (run.stage === 'started' && report === 'playback-failed') {
        run.stage = 'done'
        set('voice', runId, 'failed', M.voicePlaybackFailed)
      } else if (run.stage === 'started' && report === 'unavailable') {
        run.stage = 'done'
        set('voice', runId, 'unavailable', M.voiceUnavailable)
      } else if (run.stage === 'played' && (report === 'heard' || report === 'not-heard')) {
        run.stage = 'done'
        if (report === 'heard') heardSound = { at: deps.now(), path: run.path }
        set(
          'voice',
          runId,
          report === 'heard' ? 'passed' : 'failed',
          report === 'heard' ? M.voiceHeard : M.voiceNotHeard
        )
      }
      return snapshot()
    }
  }
}
