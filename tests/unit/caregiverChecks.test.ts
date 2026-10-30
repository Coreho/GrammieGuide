import { describe, it, expect, vi } from 'vitest'
import {
  createCaregiverChecks,
  CONNECTIVITY_URL,
  RECOVERY_OPEN_TIMEOUT_MS,
  type CaregiverChecks,
  type CaregiverChecksDeps
} from '../../src/main/services/checks/caregiverChecks'
import {
  CHECK_MESSAGES as M,
  describeCheckedAt,
  isStale,
  isVoiceReport,
  RESULT_STALE_MS,
  type CheckResults
} from '../../src/shared/checks/caregiverChecks'
import type { PageProblem } from '../../src/shared/browser/loadFailure'

/** Resolves when the signal aborts, like PowerShell being killed mid-recording. */
function untilAborted<T>(signal: AbortSignal, value: T): Promise<T> {
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(value)))
}

type Harness = {
  checks: CaregiverChecks
  log: string[]
  changes: CheckResults[]
  page: { open: boolean; problem: PageProblem | null; opened: string[] }
  holds: { active: number; started: number }
  homeReturns: () => number
  advance: (ms: number) => number
  now: () => number
}

function harness(overrides: Partial<CaregiverChecksDeps> = {}): Harness {
  let time = 1_000_000
  const log: string[] = []
  const changes: CheckResults[] = []
  const page = { open: false, problem: null as PageProblem | null, opened: [] as string[] }
  const holds = { active: 0, started: 0 }
  let homeReturns = 0
  const deps: CaregiverChecksDeps = {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
    voiceSettings: () => ({
      cloudTtsEnabled: true,
      ttsVoice: 'en-US-AriaNeural',
      localVoice: 'am_michael'
    }),
    synthesize: async () => ({
      ok: true,
      audioBase64: 'AAAA',
      mime: 'audio/mpeg',
      source: 'online'
    }),
    // The voice on this computer is missing unless a test provides it.
    synthesizeLocal: async () => ({ ok: false, reason: 'unavailable' }),
    listen: async () => ({ ok: true, text: 'hello buddy' }),
    holdListening: () => {
      holds.active++
      holds.started++
      return () => {
        holds.active--
      }
    },
    isOnline: () => true,
    fetchText: async () => 'Microsoft Connect Test',
    reserveClosedPort: async () => 4321,
    browser: {
      isOpen: () => page.open,
      problem: () => page.problem,
      open: (url) => {
        page.open = true
        page.opened.push(url)
        // A refused local port fails straight away; Home's recovery screen shows.
        page.problem = 'unreachable'
        return { ok: true }
      },
      close: () => {
        page.open = false
        page.problem = null
      }
    },
    home: {
      available: () => true,
      // Home on plain Home answers the request by opening the check page.
      requestRecoveryPage: () => void checks.openRecoveryPage(),
      returnHome: () => {
        homeReturns++
      }
    },
    log: (type) => log.push(type),
    onChange: (results) => changes.push(results),
    ...overrides
  }
  const checks = createCaregiverChecks(deps)
  return {
    checks,
    log,
    changes,
    page,
    holds,
    homeReturns: () => homeReturns,
    advance: (ms: number) => (time += ms),
    now: () => time
  }
}

describe('caregiver checks: results', () => {
  it('starts with nothing checked, so a restart never shows an old pass', () => {
    expect(harness().checks.results()).toEqual({})
  })

  it('stamps every result with when it was observed', async () => {
    const h = harness()
    await h.checks.run('connectivity')
    expect(h.checks.results().connectivity).toEqual({
      status: 'passed',
      message: M.netOk,
      checkedAt: h.now()
    })
  })

  it('describes the time checked and marks old results as history', () => {
    const at = new Date(2026, 9, 14, 14, 5).getTime()
    expect(describeCheckedAt(at, at + 30_000)).toMatch(/^Checked .*\(just now\)$/)
    expect(describeCheckedAt(at, at + 5 * 60_000)).toMatch(/\(5 minutes ago\)$/)
    const result = { status: 'passed' as const, message: '', checkedAt: at }
    expect(isStale(result, at + RESULT_STALE_MS - 1)).toBe(false)
    expect(isStale(result, at + RESULT_STALE_MS)).toBe(true)
  })

  it('accepts only known voice reports', () => {
    expect(isVoiceReport('heard')).toBe(true)
    expect(isVoiceReport('passed')).toBe(false)
    expect(isVoiceReport(undefined)).toBe(false)
  })
})

describe('caregiver checks: microphone', () => {
  it('passes when words are heard, holding the listening audio rule meanwhile', async () => {
    const h = harness({
      listen: async () => {
        expect(h.holds.active).toBe(1)
        return { ok: true, text: 'hello buddy' }
      }
    })
    const outcome = await h.checks.run('microphone')
    expect(outcome.heard).toBe('hello buddy')
    expect(outcome.results.microphone?.status).toBe('passed')
    expect(h.holds).toEqual({ active: 0, started: 1 })
  })

  it('never stores or logs what was said', async () => {
    const h = harness({ listen: async () => ({ ok: true, text: 'my secret phrase' }) })
    await h.checks.run('microphone')
    const everything = JSON.stringify([h.checks.results(), h.changes, h.log])
    expect(everything).not.toContain('secret')
    expect(h.log).toEqual(['caregiver-check-microphone-passed'])
  })

  it.each([
    ['nothing-heard', 'failed', M.micNothing],
    ['no-mic', 'unavailable', M.micNoMic],
    ['unavailable', 'unavailable', M.micUnavailable]
  ] as const)('reports %s as %s, never as a pass', async (reason, status, message) => {
    const h = harness({ listen: async () => ({ ok: false, reason }) })
    const outcome = await h.checks.run('microphone')
    expect(outcome.heard).toBeUndefined()
    expect(outcome.results.microphone).toMatchObject({ status, message })
    expect(h.holds.active).toBe(0)
  })

  it('stopping kills the recording, releases the hold and ignores a late answer', async () => {
    let recording: AbortSignal | null = null
    const h = harness({
      listen: (signal) => {
        recording = signal
        return untilAborted(signal, { ok: true as const, text: 'too late' })
      }
    })
    const running = h.checks.run('microphone')
    await vi.waitFor(() => expect(recording).not.toBeNull())
    h.checks.cancel('microphone')
    const outcome = await running
    expect(recording!.aborted).toBe(true)
    expect(outcome.heard).toBeUndefined()
    expect(outcome.results.microphone).toMatchObject({ status: 'cancelled', message: M.cancelled })
    expect(h.holds.active).toBe(0)
  })

  it('a new run replaces a running one instead of racing it', async () => {
    let calls = 0
    const h = harness({
      listen: (signal) =>
        ++calls === 1
          ? untilAborted(signal, { ok: true as const, text: 'first' })
          : Promise.resolve({ ok: false as const, reason: 'nothing-heard' as const })
    })
    const first = h.checks.run('microphone')
    await vi.waitFor(() => expect(calls).toBe(1))
    const second = await h.checks.run('microphone')
    expect((await first).heard).toBeUndefined()
    expect(second.results.microphone?.status).toBe('failed')
    expect(h.holds.active).toBe(0)
  })

  it('cancelAll (the panel locking) stops a running microphone check', async () => {
    const h = harness({
      listen: (signal) => untilAborted(signal, { ok: true as const, text: 'x' })
    })
    const running = h.checks.run('microphone')
    await vi.waitFor(() => expect(h.holds.active).toBe(1))
    h.checks.cancelAll()
    expect((await running).results.microphone?.status).toBe('cancelled')
    expect(h.holds.active).toBe(0)
  })
})

describe('caregiver checks: connectivity', () => {
  it('fails at once when Windows reports no network', async () => {
    const fetchText = vi.fn()
    const h = harness({ isOnline: () => false, fetchText })
    await h.checks.run('connectivity')
    expect(h.checks.results().connectivity).toMatchObject({
      status: 'failed',
      message: M.netOffline
    })
    expect(fetchText).not.toHaveBeenCalled()
  })

  it("passes only on Windows' own probe reply, from its fixed address", async () => {
    const fetchText = vi.fn(async () => 'Microsoft Connect Test\n')
    const h = harness({ fetchText })
    await h.checks.run('connectivity')
    expect(fetchText).toHaveBeenCalledWith(CONNECTIVITY_URL, expect.any(AbortSignal))
    expect(h.checks.results().connectivity?.status).toBe('passed')
  })

  it('treats any other reply as a sign-in page in the way', async () => {
    const h = harness({ fetchText: async () => '<html>Welcome to Hotel Wi-Fi</html>' })
    await h.checks.run('connectivity')
    expect(h.checks.results().connectivity).toMatchObject({
      status: 'failed',
      message: M.netPortal
    })
  })

  it('fails plainly when the internet cannot be reached', async () => {
    const h = harness({
      fetchText: async () => {
        throw new Error('ERR_CONNECTION_TIMED_OUT')
      }
    })
    await h.checks.run('connectivity')
    expect(h.checks.results().connectivity).toMatchObject({
      status: 'failed',
      message: M.netUnreachable
    })
  })
})

describe('caregiver checks: browser recovery', () => {
  it('opens only its own refused local page, sees the recovery screen, then returns Home', async () => {
    const h = harness()
    await h.checks.run('browserRecovery')
    expect(h.page.opened).toEqual(['http://127.0.0.1:4321/'])
    expect(h.page.open).toBe(false)
    expect(h.homeReturns()).toBe(1)
    expect(h.checks.results().browserRecovery).toMatchObject({
      status: 'passed',
      message: M.recoveryOk
    })
  })

  it("never closes a page she has open; that's 'not available', not a failure", async () => {
    const h = harness()
    h.page.open = true
    await h.checks.run('browserRecovery')
    expect(h.page.open).toBe(true)
    expect(h.page.opened).toEqual([])
    expect(h.checks.results().browserRecovery).toMatchObject({
      status: 'unavailable',
      message: M.recoveryPageOpen
    })
  })

  it('reports a busy Home when Home does not open the page in time', async () => {
    const h = harness({
      home: { available: () => true, requestRecoveryPage: () => {}, returnHome: () => {} }
    })
    const started = h.now()
    await h.checks.run('browserRecovery')
    expect(h.now() - started).toBeGreaterThanOrEqual(RECOVERY_OPEN_TIMEOUT_MS)
    expect(h.checks.results().browserRecovery).toMatchObject({
      status: 'unavailable',
      message: M.recoveryHomeBusy
    })
    // Once the check is over, its page can no longer be opened.
    expect(h.checks.openRecoveryPage()).toEqual({ ok: false })
  })

  it('fails when the recovery screen never appears, and still closes the page', async () => {
    let open = false
    const h = harness({
      // The page loads (or hangs) and Home's recovery screen never shows.
      browser: {
        isOpen: () => open,
        problem: () => null,
        open: () => {
          open = true
          return { ok: true }
        },
        close: () => {
          open = false
        }
      }
    })
    await h.checks.run('browserRecovery')
    expect(h.checks.results().browserRecovery).toMatchObject({
      status: 'failed',
      message: M.recoveryNoScreen
    })
    expect(open).toBe(false)
    expect(h.homeReturns()).toBe(1)
  })

  it('reports no Home without opening anything', async () => {
    const h = harness({
      home: { available: () => false, requestRecoveryPage: () => {}, returnHome: () => {} }
    })
    await h.checks.run('browserRecovery')
    expect(h.checks.results().browserRecovery?.status).toBe('unavailable')
    expect(h.page.opened).toEqual([])
  })

  it('Home cannot open the check page without a running check', () => {
    const h = harness()
    expect(h.checks.openRecoveryPage()).toEqual({ ok: false })
    expect(h.page.opened).toEqual([])
  })

  it('Home cannot open the check page twice in one check', async () => {
    let second: { ok: boolean } | null = null
    const h = harness({
      home: {
        available: () => true,
        requestRecoveryPage: () => {
          h.checks.openRecoveryPage()
          second = h.checks.openRecoveryPage()
        },
        returnHome: () => {}
      }
    })
    await h.checks.run('browserRecovery')
    expect(second).toEqual({ ok: false })
    expect(h.page.opened).toHaveLength(1)
  })

  it('stopping while the recovery screen shows closes the page and returns Home', async () => {
    let release: () => void = () => {}
    const h = harness({
      // Holds the run on the recovery screen until the test lets it go.
      sleep: (ms) =>
        ms >= 1000 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    })
    const running = h.checks.run('browserRecovery')
    await vi.waitFor(() => expect(h.page.open).toBe(true))
    h.checks.cancel('browserRecovery')
    release()
    await running
    expect(h.page.open).toBe(false)
    expect(h.homeReturns()).toBe(1)
    expect(h.checks.results().browserRecovery?.status).toBe('cancelled')
  })
})

describe('caregiver checks: voice', () => {
  it("hands back the online voice's audio, and playback alone is not a pass", async () => {
    const h = harness()
    const start = await h.checks.startVoice()
    expect(start).toMatchObject({ kind: 'audio', audioBase64: 'AAAA', mime: 'audio/mpeg' })
    const results = h.checks.reportVoice(start.runId, 'played')
    expect(results.voice).toMatchObject({ status: 'played', message: M.voicePlayedOnline })
    expect(h.checks.lastHeardSound()).toBeNull()
  })

  it('passes only when the caregiver says they heard it, after playback', async () => {
    const h = harness()
    const { runId } = await h.checks.startVoice()
    // A confirmation before playback finished is ignored.
    expect(h.checks.reportVoice(runId, 'heard').voice?.status).toBe('checking')
    h.checks.reportVoice(runId, 'played')
    const results = h.checks.reportVoice(runId, 'heard')
    expect(results.voice).toMatchObject({ status: 'passed', message: M.voiceHeard })
    expect(h.checks.lastHeardSound()).toEqual({ at: h.now(), path: 'online' })
    // Once answered, the run is over.
    expect(h.checks.reportVoice(runId, 'not-heard').voice?.status).toBe('passed')
  })

  it("'not heard' is a failure that keeps no heard-sound record", async () => {
    const h = harness()
    const { runId } = await h.checks.startVoice()
    h.checks.reportVoice(runId, 'played')
    expect(h.checks.reportVoice(runId, 'not-heard').voice).toMatchObject({
      status: 'failed',
      message: M.voiceNotHeard
    })
    expect(h.checks.lastHeardSound()).toBeNull()
  })

  it('a playback failure or a missing Windows voice never becomes a pass', async () => {
    const h = harness()
    const first = await h.checks.startVoice()
    expect(h.checks.reportVoice(first.runId, 'playback-failed').voice?.status).toBe('failed')
    expect(h.checks.reportVoice(first.runId, 'heard').voice?.status).toBe('failed')
    const second = await h.checks.startVoice()
    expect(h.checks.reportVoice(second.runId, 'unavailable').voice).toMatchObject({
      status: 'unavailable',
      message: M.voiceUnavailable
    })
  })

  it('says honestly when the Windows voice is used instead', async () => {
    const off = harness({
      voiceSettings: () => ({ cloudTtsEnabled: false, ttsVoice: 'x', localVoice: 'am_michael' })
    })
    const offStart = await off.checks.startVoice()
    expect(offStart).toMatchObject({ kind: 'windows', fallback: false })
    expect(off.checks.reportVoice(offStart.runId, 'played').voice?.message).toBe(
      M.voicePlayedWindows
    )
    const broken = harness({ synthesize: async () => ({ ok: false, reason: 'unavailable' }) })
    const brokenStart = await broken.checks.startVoice()
    expect(brokenStart).toMatchObject({ kind: 'windows', fallback: true })
    broken.checks.reportVoice(brokenStart.runId, 'played')
    broken.checks.reportVoice(brokenStart.runId, 'heard')
    expect(broken.checks.results().voice?.message).toBe(M.voiceHeard)
    expect(broken.checks.lastHeardSound()?.path).toBe('windows')
  })

  it('uses the voice on this computer next, and says when it stands in for the online voice', async () => {
    const synthesizeLocal = vi.fn(async () => ({
      ok: true as const,
      audioBase64: 'BBBB',
      mime: 'audio/wav' as const,
      source: 'local' as const
    }))
    const off = harness({
      voiceSettings: () => ({ cloudTtsEnabled: false, ttsVoice: 'x', localVoice: 'bm_george' }),
      synthesizeLocal
    })
    const offStart = await off.checks.startVoice()
    expect(offStart).toMatchObject({ kind: 'audio', audioBase64: 'BBBB', mime: 'audio/wav' })
    expect(synthesizeLocal).toHaveBeenCalledWith(expect.any(String), 'bm_george')
    expect(off.checks.reportVoice(offStart.runId, 'played').voice?.message).toBe(M.voicePlayedLocal)
    off.checks.reportVoice(offStart.runId, 'heard')
    expect(off.checks.lastHeardSound()?.path).toBe('local')

    const broken = harness({
      synthesize: async () => ({ ok: false, reason: 'unavailable' }),
      synthesizeLocal
    })
    const brokenStart = await broken.checks.startVoice()
    expect(broken.checks.reportVoice(brokenStart.runId, 'played').voice?.message).toBe(
      M.voicePlayedLocalFallback
    )

    const neither = harness({ synthesize: async () => ({ ok: false, reason: 'unavailable' }) })
    const neitherStart = await neither.checks.startVoice()
    expect(neitherStart).toMatchObject({ kind: 'windows', fallback: true })
    expect(neither.checks.reportVoice(neitherStart.runId, 'played').voice?.message).toBe(
      M.voicePlayedFallback
    )
  })

  it('a report for an older run is ignored', async () => {
    const h = harness()
    const old = await h.checks.startVoice()
    const current = await h.checks.startVoice()
    expect(h.checks.reportVoice(old.runId, 'played').voice?.status).toBe('checking')
    expect(h.checks.reportVoice(current.runId, 'played').voice?.status).toBe('played')
  })

  it('cancelling while the voice is being made drops the audio and later reports', async () => {
    let finish: () => void = () => {}
    const h = harness({
      synthesize: () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true, audioBase64: 'AAAA', mime: 'audio/mpeg' })
        })
    })
    const starting = h.checks.startVoice()
    await vi.waitFor(() => expect(h.checks.results().voice?.status).toBe('checking'))
    h.checks.cancelAll()
    finish()
    const start = await starting
    expect(start.kind).toBe('cancelled')
    expect(h.checks.reportVoice(start.runId, 'played').voice?.status).toBe('cancelled')
    expect(h.log).toEqual(['caregiver-check-voice-cancelled'])
  })
})
