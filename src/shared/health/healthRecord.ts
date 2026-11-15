import { z } from 'zod'
import type { VoicePath } from '../checks/caregiverChecks'

/**
 * The caregiver's "is it working?" record (TASK-25). The activity and
 * reliability logs live in memory and vanish on restart, which is exactly when
 * the caregiver needs to know what happened. This is the small part that is
 * saved: one entry per time GrammieGuide started, and how that run ended.
 *
 * It records facts about the computer and the app only. Nothing here measures
 * her: no taps, no idle time, nothing that could be read as distress.
 */

export const HEALTH_RECORD_VERSION = 1
/** Older runs are dropped, and never more than this many are kept, so the file stays a few KB. */
export const KEEP_RUNS_MS = 30 * 24 * 60 * 60_000
export const MAX_RUNS = 200
export const WEEK_MS = 7 * 24 * 60 * 60_000

/**
 * How a run ended. The first four are written by the app as it ends; the last
 * two are worked out at the next start for a run that never got to say:
 * - `power-loss`: Windows started again after the run's last heartbeat, so the
 *   computer went off (power cut, held power button, forced restart) with
 *   GrammieGuide still running.
 * - `stopped-unexpectedly`: same Windows session, so the app itself died or
 *   hung (and the watchdog, if it was installed, brought it back).
 * Fast Startup can keep Windows' uptime across an ordinary shutdown, but an
 * ordinary shutdown reaches the app as `windows-session-end` first.
 */
export const RUN_ENDINGS = [
  'quit',
  'closed',
  'windows-session-end',
  'home-gave-up',
  'power-loss',
  'stopped-unexpectedly'
] as const
export type RunEnding = (typeof RUN_ENDINGS)[number]

const timestamp = z.number().int().nonnegative()
const runSchema = z.object({
  startedAt: timestamp,
  /** Home's page finished loading: this start was a successful one. */
  homeReadyAt: timestamp.optional(),
  /** The last heartbeat the run wrote, recovered at the next start. */
  lastAliveAt: timestamp.optional(),
  ending: z.enum(RUN_ENDINGS).optional(),
  endedAt: timestamp.optional()
})
export type HealthRun = z.infer<typeof runSchema>

const healthRecordSchema = z.object({
  version: z.literal(HEALTH_RECORD_VERSION),
  runs: z.array(runSchema).max(MAX_RUNS),
  soundHeard: z.object({ at: timestamp, path: z.enum(['online', 'local', 'windows']) }).optional()
})
export type HealthRecord = z.infer<typeof healthRecordSchema>

export function emptyHealthRecord(): HealthRecord {
  return { version: HEALTH_RECORD_VERSION, runs: [] }
}

/** Null for anything that isn't a record this version wrote; the caller sets it aside. */
export function parseHealthRecord(value: unknown): HealthRecord | null {
  const parsed = healthRecordSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function prune(runs: HealthRun[], now: number): HealthRun[] {
  return runs.filter((run) => now - run.startedAt <= KEEP_RUNS_MS).slice(-MAX_RUNS)
}

/**
 * A new start. A previous run that never recorded an ending is classified
 * here, using its last heartbeat (`previousAliveAt`, read from heartbeat.txt
 * before this run overwrites it) and when Windows last booted.
 */
export function beginRun(
  record: HealthRecord,
  { now, bootAt, previousAliveAt }: { now: number; bootAt: number; previousAliveAt: number | null }
): HealthRecord {
  const runs = record.runs.map((run) => ({ ...run }))
  const previous = runs.at(-1)
  if (previous && !previous.ending) {
    // A heartbeat older than the run belongs to an even earlier one; ignore it.
    const alive =
      previousAliveAt !== null && previousAliveAt >= previous.startedAt
        ? Math.max(previousAliveAt, previous.lastAliveAt ?? 0)
        : (previous.lastAliveAt ?? previous.homeReadyAt ?? previous.startedAt)
    previous.lastAliveAt = alive
    previous.ending = bootAt > alive ? 'power-loss' : 'stopped-unexpectedly'
    previous.endedAt = alive
  }
  runs.push({ startedAt: now })
  return { ...record, runs: prune(runs, now) }
}

/** The first ending wins: Ctrl+Shift+Q records `quit` before the `closed` that quitting also triggers. */
export function endRun(record: HealthRecord, ending: RunEnding, now: number): HealthRecord {
  const current = record.runs.at(-1)
  if (!current || current.ending) return record
  return { ...record, runs: [...record.runs.slice(0, -1), { ...current, ending, endedAt: now }] }
}

export function markHomeReady(record: HealthRecord, now: number): HealthRecord {
  const current = record.runs.at(-1)
  if (!current || current.homeReadyAt !== undefined || current.ending) return record
  return { ...record, runs: [...record.runs.slice(0, -1), { ...current, homeReadyAt: now }] }
}

export function recordSoundHeard(
  record: HealthRecord,
  sound: { at: number; path: VoicePath }
): HealthRecord {
  return { ...record, soundHeard: { at: sound.at, path: sound.path } }
}

/** One line of the watchdog's safety-events.log (resources/watchdog/watchdog.ps1). */
export interface SafetyEvent {
  at: number
  type: string
}

/** Tolerant: the watchdog appends one JSON object per line, and a cut or odd line is skipped. */
export function parseSafetyLog(text: string): SafetyEvent[] {
  const events: SafetyEvent[] = []
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line) as { ts?: unknown; type?: unknown }
      const at = typeof value.ts === 'string' ? Date.parse(value.ts) : NaN
      if (Number.isFinite(at) && typeof value.type === 'string')
        events.push({ at, type: value.type })
    } catch {
      // Ignore a damaged line rather than the whole history.
    }
  }
  return events
}

export interface Tally {
  count: number
  last: number | null
}

export interface HealthSummary {
  now: number
  network: { online: boolean | null; since: number }
  /** This run: when GrammieGuide started and when Home was ready. */
  current: { startedAt: number; homeReadyAt: number | null } | null
  /** The latest start that reached Home, this run included. */
  lastSuccessfulStartup: number | null
  week: {
    stoppedUnexpectedly: Tally
    powerLoss: Tally
    closedOnPurpose: Tally
    windowsSessionEnd: Tally
    watchdogRestarts: Tally
    /** Her own callback requests that failed; caregiver test texts never count. */
    failedHelpRequests: Tally | null
  }
  soundHeard: { at: number; path: VoicePath } | null
}

function tally(times: number[], now: number): Tally {
  const recent = times.filter((at) => at <= now && now - at <= WEEK_MS)
  return { count: recent.length, last: recent.length ? Math.max(...recent) : null }
}

export function summarizeHealth(
  record: HealthRecord,
  now: number,
  extras: {
    network: { online: boolean | null; since: number }
    safetyEvents: SafetyEvent[]
    /** Null when the request history can't be read. */
    failedHelpRequests: number[] | null
  }
): HealthSummary {
  const runs = record.runs
  const current = runs.at(-1)
  const endedAt = (endings: RunEnding[]): number[] =>
    runs
      .filter((run) => run.ending && endings.includes(run.ending))
      .map((run) => run.endedAt ?? run.startedAt)
  const ready = runs.filter((run) => run.homeReadyAt !== undefined)
  return {
    now,
    network: extras.network,
    current:
      current && !current.ending
        ? { startedAt: current.startedAt, homeReadyAt: current.homeReadyAt ?? null }
        : null,
    lastSuccessfulStartup: ready.length ? ready.at(-1)!.startedAt : null,
    week: {
      // Home giving up exits the app on purpose, but only because Home kept failing.
      stoppedUnexpectedly: tally(endedAt(['stopped-unexpectedly', 'home-gave-up']), now),
      powerLoss: tally(endedAt(['power-loss']), now),
      closedOnPurpose: tally(endedAt(['quit', 'closed']), now),
      windowsSessionEnd: tally(endedAt(['windows-session-end']), now),
      watchdogRestarts: tally(
        extras.safetyEvents
          .filter((event) => event.type === 'watchdog-relaunch-succeeded')
          .map((event) => event.at),
        now
      ),
      failedHelpRequests: extras.failedHelpRequests ? tally(extras.failedHelpRequests, now) : null
    },
    soundHeard: record.soundHeard ?? null
  }
}
