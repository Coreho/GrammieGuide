import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { HealthSummary, Tally } from '@shared/health/healthRecord'
import type { VoicePath } from '@shared/checks/caregiverChecks'
import { ChecksTab } from './ChecksTab'

/**
 * TASK-25: "is it working?" at a glance. Every line states what happened to
 * the computer or the app, with the time it happened. It never describes her:
 * no idle time, no taps, nothing that reads as distress.
 */

const REFRESH_MS = 30_000

const VOICE_PATHS: Record<VoicePath, string> = {
  online: "Buddy's online voice",
  local: 'the voice on this computer',
  windows: 'the Windows voice'
}

function when(at: number, now: number): string {
  const date = new Date(at)
  const today = new Date(now)
  const sameDay = date.toDateString() === today.toDateString()
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return sameDay
    ? `today at ${time}`
    : `${date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} at ${time}`
}

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '6px 0', borderBottom: '1px solid #eef0f2' }}>
      <dt style={{ width: 260, flexShrink: 0, color: '#444' }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  )
}

function TallyText({ tally, now, none }: { tally: Tally; now: number; none: string }) {
  if (!tally.count || tally.last === null) return <>{none}</>
  return (
    <>
      {times(tally.count)}, most recently {when(tally.last, now)}
    </>
  )
}

const card = {
  border: '1px solid #d0d7de',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  maxWidth: 720
} as const

export function StatusTab() {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(() => {
    window.admin.getHealthSummary().then(
      (next) => {
        setSummary(next)
        setFailed(false)
      },
      () => setFailed(true)
    )
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  if (!summary) {
    return (
      <div>
        <h2>Status</h2>
        <p role="status">{failed ? 'The status could not be read. Try again.' : 'Loading…'}</p>
      </div>
    )
  }
  const { now, network, current, week } = summary
  return (
    <div>
      <h2>Status</h2>
      <p style={{ maxWidth: 720 }}>
        What has happened on her computer. The history is kept for 30 days, including across
        restarts; counts below cover the last 7 days.
      </p>
      {failed && <p role="status">The latest update could not be read; showing the last one.</p>}

      <section style={card} aria-labelledby="status-now">
        <h3 id="status-now" style={{ marginTop: 0 }}>
          Right now
        </h3>
        <dl style={{ margin: 0 }} data-status="now">
          <Row label="Internet">
            {network.online === null
              ? 'Not checked yet (it is checked every 10 seconds).'
              : network.online
                ? `Online since ${when(network.since, now)}.`
                : `Offline since ${when(network.since, now)}.`}
          </Row>
          <Row label="GrammieGuide running since">
            {current ? `${when(current.startedAt, now)}.` : 'Unknown.'}
          </Row>
          <Row label="Last successful startup">
            {summary.lastSuccessfulStartup === null
              ? 'Home has not finished loading yet.'
              : `${when(summary.lastSuccessfulStartup, now)} (Home loaded).`}
          </Row>
        </dl>
      </section>

      <section style={card} aria-labelledby="status-week">
        <h3 id="status-week" style={{ marginTop: 0 }}>
          Last 7 days
        </h3>
        <dl style={{ margin: 0 }} data-status="week">
          <Row label="GrammieGuide stopped unexpectedly">
            <TallyText tally={week.stoppedUnexpectedly} now={now} none="Never." />
          </Row>
          <Row label="Restarted by the watchdog">
            <TallyText tally={week.watchdogRestarts} now={now} none="Never." />
          </Row>
          <Row label="Computer lost power or was forced off">
            <TallyText tally={week.powerLoss} now={now} none="Never." />
          </Row>
          <Row label="Windows shut down, restarted or signed out">
            <TallyText tally={week.windowsSessionEnd} now={now} none="Never." />
          </Row>
          <Row label="GrammieGuide closed on purpose">
            <TallyText tally={week.closedOnPurpose} now={now} none="Never." />
          </Row>
          <Row label="Help requests that failed">
            {week.failedHelpRequests ? (
              <TallyText tally={week.failedHelpRequests} now={now} none="None." />
            ) : (
              'The request history could not be read.'
            )}
          </Row>
        </dl>
        <p style={{ margin: '12px 0 0', color: '#555' }}>
          “Stopped unexpectedly” means Windows kept running but GrammieGuide did not, or Home kept
          failing to load. “Lost power or forced off” means the computer started again without
          GrammieGuide having been closed. Watchdog restarts are counted only in the installed app.
        </p>
      </section>

      <section style={card} aria-labelledby="status-sound">
        <h3 id="status-sound" style={{ marginTop: 0 }}>
          Sound
        </h3>
        <p data-status="sound" style={{ marginTop: 0 }}>
          {summary.soundHeard
            ? `Last confirmed heard ${when(summary.soundHeard.at, now)}, using ${VOICE_PATHS[summary.soundHeard.path]}.`
            : 'Nobody has confirmed hearing a test sound yet.'}
        </p>
        <ChecksTab
          only={['voice']}
          onResults={(results) => {
            if (results.voice?.status === 'passed') refresh()
          }}
        />
      </section>
    </div>
  )
}
