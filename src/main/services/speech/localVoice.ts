import type { BuddySpeakResult } from '@shared/ipcContract'
import { DEFAULT_LOCAL_VOICE, isLocalVoice, LOCAL_VOICE_SPEED } from '@shared/buddy/localVoices'
import { plainForSpeech } from './ttsService'
import type { VoiceWorkerReply, VoiceWorkerRequest } from './localVoiceProtocol'

/**
 * Buddy's voice on this computer: Kokoro-82M, an open-weight speech model,
 * standing in when the online Edge voice is off or failing (on 2026-10-27
 * Microsoft's endpoint refused every request, and she heard the robotic
 * Windows voice instead). The Windows voice stays the last resort.
 *
 * The model runs in an Electron utility process rather than here: it is
 * native ONNX code using every core for a second or two per line, and a
 * crash or hang there must never take Home or the heartbeat with it. A dead
 * process just means this line falls back; the next line starts a new one.
 * Three crashes in ten minutes and it stays off until the app restarts, so a
 * broken model can't turn into a crash loop.
 *
 * Loading takes several seconds, so an ordinary line never waits for it:
 * the first request warms the process up and that line uses the Windows
 * voice. Callers that must hear this voice specifically (the caregiver's
 * preview and voice check) pass `wait`.
 */

export type VoiceProcess = {
  postMessage(message: VoiceWorkerRequest): void
  on(event: 'message', listener: (message: VoiceWorkerReply) => void): void
  on(event: 'exit', listener: (code: number) => void): void
  kill(): void
}

export type LocalVoiceDeps = {
  /** False when the model files are missing, or the local voice is switched off for tests. */
  modelPresent: () => boolean
  fork: () => VoiceProcess
  log: (type: string) => void
  now?: () => number
  /** How long one line may take once the model is loaded. */
  timeoutMs?: (chars: number) => number
  /** How long `wait` waits for the model to load. */
  readyTimeoutMs?: number
}

export type LocalVoice = {
  speak(text: string, voice: string, opts?: { wait?: boolean }): Promise<BuddySpeakResult>
  /** Starts loading in the background, so the first line that needs it doesn't fall back. */
  warm(): void
  dispose(): void
}

const UNAVAILABLE: BuddySpeakResult = { ok: false, reason: 'unavailable' }
const MAX_CRASHES = 3
const CRASH_WINDOW_MS = 10 * 60_000
/**
 * Lines waiting behind the one being made. The renderer asks for the next piece
 * of a reply while one plays, so two can be real; a line still waiting when two
 * newer ones arrive was almost certainly abandoned (a new message, more pats).
 */
const MAX_WAITING = 2

type Line = {
  id: number
  request: VoiceWorkerRequest
  proc: VoiceProcess
  resolve: (result: BuddySpeakResult) => void
}

/** Measured at about a third of real time on a 12-thread PC; her PC gets room for being slower. */
export function lineTimeoutMs(chars: number): number {
  return Math.min(45_000, 10_000 + chars * 60)
}

export function createLocalVoice(deps: LocalVoiceDeps): LocalVoice {
  const now = deps.now ?? Date.now
  const timeoutMs = deps.timeoutMs ?? lineTimeoutMs
  const readyTimeoutMs = deps.readyTimeoutMs ?? 60_000
  let state: 'idle' | 'loading' | 'ready' | 'off' = 'idle'
  let child: VoiceProcess | null = null
  let crashes: number[] = []
  let nextId = 1
  const pending = new Map<number, (result: BuddySpeakResult) => void>()
  let readyWaiters: ((ok: boolean) => void)[] = []
  // The worker makes one line at a time, so main hands it one at a time and a
  // line's timeout starts only when the worker starts on it. Counting time spent
  // queued behind other lines killed a healthy voice as hung.
  const waiting: Line[] = []
  let busy = false

  function sendNext(): void {
    if (busy) return
    const line = waiting.shift()
    if (!line) return
    if (child !== line.proc) {
      line.resolve(UNAVAILABLE)
      sendNext()
      return
    }
    busy = true
    const timer = setTimeout(() => {
      if (!pending.delete(line.id)) return
      busy = false
      line.resolve(UNAVAILABLE)
      // A line that never comes back is a hang: treat it like a crash.
      if (child === line.proc) crashed()
      sendNext()
    }, timeoutMs(line.request.text.length))
    pending.set(line.id, (result) => {
      clearTimeout(timer)
      busy = false
      line.resolve(result)
      sendNext()
    })
    line.proc.postMessage(line.request)
  }

  function settleWaiters(ok: boolean): void {
    const waiters = readyWaiters
    readyWaiters = []
    for (const done of waiters) done(ok)
  }

  function dropProcess(): void {
    const old = child
    child = null
    old?.kill()
    for (const resolve of pending.values()) resolve(UNAVAILABLE)
    pending.clear()
    settleWaiters(false)
  }

  function crashed(): void {
    dropProcess()
    const t = now()
    crashes = [...crashes.filter((at) => t - at < CRASH_WINDOW_MS), t]
    if (crashes.length >= MAX_CRASHES) {
      state = 'off'
      deps.log('buddy-local-voice-gave-up')
    } else {
      state = 'idle'
      deps.log('buddy-local-voice-crashed')
    }
  }

  function warm(): void {
    if (state !== 'idle' || !deps.modelPresent()) return
    let proc: VoiceProcess
    try {
      proc = deps.fork()
    } catch {
      crashed()
      return
    }
    state = 'loading'
    child = proc
    proc.on('message', (message) => {
      if (child !== proc) return
      if (message.type === 'ready') {
        state = 'ready'
        settleWaiters(true)
      } else if (message.type === 'failed') {
        // The files are there but won't load; retrying would only fail again.
        dropProcess()
        state = 'off'
        deps.log('buddy-local-voice-unavailable')
      } else {
        const resolve = pending.get(message.id)
        pending.delete(message.id)
        resolve?.(
          message.type === 'audio'
            ? {
                ok: true,
                audioBase64: Buffer.from(message.wav).toString('base64'),
                mime: 'audio/wav',
                source: 'local'
              }
            : UNAVAILABLE
        )
      }
    })
    proc.on('exit', () => {
      if (child === proc) crashed()
    })
  }

  function whenReady(): Promise<boolean> {
    warm()
    if (state === 'ready') return Promise.resolve(true)
    if (state !== 'loading') return Promise.resolve(false)
    return new Promise((resolve) => {
      const done = (ok: boolean): void => {
        clearTimeout(timer)
        resolve(ok)
      }
      const timer = setTimeout(() => {
        readyWaiters = readyWaiters.filter((waiter) => waiter !== done)
        resolve(false)
      }, readyTimeoutMs)
      readyWaiters.push(done)
    })
  }

  return {
    warm,
    async speak(text, voice, opts = {}) {
      const plain = plainForSpeech(text)
      if (!plain) return { ok: false, reason: 'empty' }
      if (opts.wait) {
        if (!(await whenReady())) return UNAVAILABLE
      } else {
        warm()
        if (state !== 'ready') return UNAVAILABLE
      }
      const proc = child
      if (!proc) return UNAVAILABLE
      const id = nextId++
      return new Promise<BuddySpeakResult>((resolve) => {
        // Falls back rather than making the newest line wait behind abandoned ones.
        while (waiting.length >= MAX_WAITING) waiting.shift()!.resolve(UNAVAILABLE)
        waiting.push({
          id,
          proc,
          resolve,
          request: {
            id,
            text: plain,
            voice: isLocalVoice(voice) ? voice : DEFAULT_LOCAL_VOICE,
            speed: LOCAL_VOICE_SPEED
          }
        })
        sendNext()
      })
    },
    dispose() {
      dropProcess()
      state = 'off'
    }
  }
}
