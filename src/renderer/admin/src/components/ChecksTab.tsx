import { useEffect, useRef, useState } from 'react'
import {
  CHECK_IDS,
  CHECK_LABELS,
  describeCheckedAt,
  isStale,
  type CheckId,
  type CheckResults,
  type CheckStatus,
  type VoiceReport
} from '@shared/checks/caregiverChecks'
import { holdAudio } from '../../../audio/audioBridge'

const DESCRIPTIONS: Record<CheckId, string> = {
  voice: "Plays a short line in Buddy's voice through this computer's speaker.",
  microphone:
    "Listens once for a short sentence, the way Buddy's Talk button does. What it hears is shown here only, never saved.",
  connectivity: 'Checks that this computer can reach the internet.',
  browserRecovery:
    "Opens a page that can't load on Home, checks that the friendly 'page didn't load' screen appears, then goes back Home. Run it when nobody is using Home."
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  checking: 'Checking…',
  played: 'Played - waiting for your answer',
  passed: 'Passed',
  failed: 'Failed',
  unavailable: 'Not available',
  cancelled: 'Stopped'
}

const STATUS_COLORS: Record<CheckStatus, string> = {
  checking: '#3a5f8a',
  played: '#8a6d1f',
  passed: '#2e7d32',
  failed: '#b3261e',
  unavailable: '#5f6368',
  cancelled: '#5f6368'
}

const ignore = (): void => {}

/** Windows voices can load after the page does; give them a moment before calling them missing. */
function windowsVoicesReady(): Promise<boolean> {
  if (!('speechSynthesis' in window)) return Promise.resolve(false)
  if (speechSynthesis.getVoices().length > 0) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      speechSynthesis.removeEventListener('voiceschanged', done)
      resolve(speechSynthesis.getVoices().length > 0)
    }
    const timer = setTimeout(done, 1500)
    speechSynthesis.addEventListener('voiceschanged', done)
  })
}

export function ChecksTab() {
  const [results, setResults] = useState<CheckResults>({})
  const [heard, setHeard] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const voiceGeneration = useRef(0)
  const stopVoice = useRef<() => void>(ignore)
  const voiceRun = useRef<number | null>(null)

  useEffect(() => {
    let live = true
    window.admin.listChecks().then((r) => live && setResults(r), ignore)
    const off = window.admin.onChecksChanged((r) => setResults(r))
    // Keeps "5 minutes ago" honest while the panel stays open.
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      live = false
      off()
      clearInterval(tick)
      // Closing the panel (or locking it) leaves no recording or delayed speech behind.
      voiceGeneration.current++
      stopVoice.current()
      window.admin.cancelChecks().catch(ignore)
    }
  }, [])

  const run = async (id: Exclude<CheckId, 'voice'>): Promise<void> => {
    if (id === 'microphone') setHeard(null)
    try {
      const outcome = await window.admin.runCheck(id)
      setResults(outcome.results)
      if (id === 'microphone') setHeard(outcome.heard ?? null)
    } catch {
      // Locked mid-check: the lock screen replaces this panel.
    }
  }

  const stop = (id: CheckId): void => {
    if (id === 'voice') {
      voiceGeneration.current++
      stopVoice.current()
    }
    window.admin.cancelChecks(id).then(setResults, ignore)
  }

  const runVoice = async (): Promise<void> => {
    stopVoice.current()
    const generation = ++voiceGeneration.current
    const current = (): boolean => generation === voiceGeneration.current
    const start = await window.admin.startVoiceCheck().catch(() => null)
    if (!start || start.kind === 'cancelled' || !current()) return
    voiceRun.current = start.runId
    const report = (value: VoiceReport): void => {
      if (current())
        window.admin
          .reportVoiceCheck({ runId: start.runId, report: value })
          .then(setResults, ignore)
    }
    if (start.kind === 'windows' && !(await windowsVoicesReady())) return report('unavailable')
    if (!current()) return
    // The same audio rule as Buddy on Home: music lowers, and a newer voice or listening stops this one.
    const hold = await holdAudio('buddyVoice', () => {
      if (current()) stop('voice')
    })
    if (!hold.allowed || !current()) {
      hold.release()
      if (current()) stop('voice')
      return
    }
    let ended = false
    let cleanup = ignore
    const finish = (outcome: VoiceReport | null): void => {
      if (ended) return
      ended = true
      cleanup()
      hold.release()
      if (outcome) report(outcome)
    }
    stopVoice.current = () => finish(null)
    if (start.kind === 'audio') {
      const bytes = Uint8Array.from(atob(start.audioBase64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: start.mime }))
      const audio = new Audio(url)
      cleanup = () => {
        audio.pause()
        URL.revokeObjectURL(url)
      }
      audio.onended = () => finish('played')
      audio.onerror = () => finish('playback-failed')
      await audio.play().catch(() => finish('playback-failed'))
    } else {
      const utterance = new SpeechSynthesisUtterance(
        'Hello! This is Buddy, checking that you can hear me.'
      )
      cleanup = () => speechSynthesis.cancel()
      utterance.onend = () => finish('played')
      utterance.onerror = () => finish('playback-failed')
      speechSynthesis.speak(utterance)
    }
  }

  return (
    <div>
      <h2>Checks</h2>
      <p style={{ maxWidth: 640 }}>
        Run these on her computer to see that each part actually works. Each result shows when it
        was checked; a pass earlier doesn't mean it still works now.
      </p>
      {CHECK_IDS.map((id) => {
        const result = results[id]
        const checking = result?.status === 'checking'
        return (
          <section
            key={id}
            data-check={id}
            style={{
              border: '1px solid #d0d7de',
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
              maxWidth: 640
            }}
          >
            <h3 style={{ margin: '0 0 4px' }}>{CHECK_LABELS[id]}</h3>
            <p style={{ margin: '0 0 12px', color: '#444' }}>{DESCRIPTIONS[id]}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                disabled={checking}
                onClick={() => void (id === 'voice' ? runVoice() : run(id))}
              >
                Check now
              </button>
              {(checking || result?.status === 'played') && (
                <button onClick={() => stop(id)}>Stop</button>
              )}
            </div>
            <div role="status" aria-live="polite" style={{ marginTop: 12 }}>
              {result ? (
                <>
                  <strong
                    data-check-status={result.status}
                    style={{ color: STATUS_COLORS[result.status] }}
                  >
                    {STATUS_LABELS[result.status]}
                  </strong>
                  <p style={{ margin: '4px 0' }}>{result.message}</p>
                  {id === 'microphone' && heard && result.status === 'passed' && (
                    <p style={{ margin: '4px 0' }}>It heard: “{heard}”</p>
                  )}
                  {result.status !== 'checking' && (
                    <small>
                      {describeCheckedAt(result.checkedAt, now)}
                      {isStale(result, now) && ' - run it again to check it now.'}
                    </small>
                  )}
                </>
              ) : (
                <small>Not checked since GrammieGuide started.</small>
              )}
            </div>
            {id === 'voice' && result?.status === 'played' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() =>
                    void window.admin
                      .reportVoiceCheck({ runId: voiceRun.current ?? -1, report: 'heard' })
                      .then(setResults, ignore)
                  }
                >
                  I heard it
                </button>
                <button
                  onClick={() =>
                    void window.admin
                      .reportVoiceCheck({ runId: voiceRun.current ?? -1, report: 'not-heard' })
                      .then(setResults, ignore)
                  }
                >
                  I didn't hear it
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
