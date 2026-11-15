import { copyFileSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  beginRun,
  emptyHealthRecord,
  endRun,
  markHomeReady,
  parseHealthRecord,
  parseSafetyLog,
  recordSoundHeard,
  summarizeHealth,
  type HealthRecord,
  type HealthSummary,
  type RunEnding,
  type SafetyEvent
} from '@shared/health/healthRecord'
import type { VoicePath } from '@shared/checks/caregiverChecks'
import { logReliabilityEvent } from '../reliability/reliabilityLog'

export const HEALTH_FILE = 'health-record.json'
export const HEALTH_CORRUPT_FILE = 'health-record.corrupt.json'
/** A real record is a few KB (200 runs at most); anything far bigger was not written by us. */
export const MAX_HEALTH_FILE_BYTES = 256 * 1024
/** The watchdog only appends, so the app keeps its log short. */
export const SAFETY_LOG = 'safety-events.log'
export const MAX_SAFETY_LOG_BYTES = 64 * 1024
export const KEEP_SAFETY_LINES = 200

type Read = { kind: 'missing' } | { kind: 'ok'; record: HealthRecord } | { kind: 'damaged' }

function readRecord(path: string): Read {
  let text: string
  try {
    if (statSync(path).size > MAX_HEALTH_FILE_BYTES) return { kind: 'damaged' }
    text = readFileSync(path, 'utf8')
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'missing' }
      : { kind: 'damaged' }
  }
  try {
    const record = parseHealthRecord(JSON.parse(text))
    return record ? { kind: 'ok', record } : { kind: 'damaged' }
  } catch {
    return { kind: 'damaged' }
  }
}

/** Temp file then rename, synchronously: endings are written as the app exits. */
function writeAtomic(path: string, text: string): void {
  const temp = `${path}.tmp`
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, path)
}

/** The previous run's last heartbeat. Must be read before startHeartbeat() overwrites it. */
export function readLastHeartbeat(heartbeatPath: string): number | null {
  try {
    const value = Number(readFileSync(heartbeatPath, 'utf8').trim())
    if (Number.isFinite(value) && value > 0) return value
    // An unreadable value still tells us when the file was last written.
    return statSync(heartbeatPath).mtimeMs
  } catch {
    return null
  }
}

/**
 * The watchdog's restarts, read from the log it appends to. Over the size cap
 * the log is cut to its newest lines, so it can't grow without limit on a
 * computer that runs for years.
 */
export function readSafetyEvents(userDataDir: string): SafetyEvent[] {
  const path = join(userDataDir, SAFETY_LOG)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_SAFETY_LOG_BYTES) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    text = lines.slice(-KEEP_SAFETY_LINES).join('\r\n') + '\r\n'
    try {
      writeAtomic(path, text)
    } catch (err) {
      logReliabilityEvent({ op: 'safety-log-trim', ok: false, detail: String(err) })
    }
  }
  return parseSafetyLog(text)
}

export interface HealthStore {
  homeReady(): void
  end(ending: RunEnding): void
  soundHeard(sound: { at: number; path: VoicePath }): void
  summary(extras: Parameters<typeof summarizeHealth>[2]): HealthSummary
  record(): HealthRecord
}

/**
 * Loads the record, starts this run and saves it. A damaged or oversized file
 * is copied aside (one copy, replaced each time, so they can't pile up) and the
 * record starts again; losing the history must never stop Home from starting.
 */
export function createHealthStore(
  userDataDir: string,
  {
    now,
    bootAt,
    previousAliveAt
  }: { now: () => number; bootAt: number; previousAliveAt: number | null }
): HealthStore {
  const path = join(userDataDir, HEALTH_FILE)
  const read = readRecord(path)
  let record = read.kind === 'ok' ? read.record : emptyHealthRecord()
  if (read.kind === 'damaged') {
    try {
      copyFileSync(path, join(userDataDir, HEALTH_CORRUPT_FILE))
    } catch {
      // Nothing worth keeping could be copied; starting fresh is still right.
    }
    logReliabilityEvent({
      op: 'health-record-reset',
      ok: false,
      detail: `The saved status history could not be read and was started again; the old file is ${HEALTH_CORRUPT_FILE}.`
    })
  }

  let saving = true
  const save = (next: HealthRecord): void => {
    record = next
    if (!saving) return
    try {
      writeAtomic(path, JSON.stringify(record))
    } catch (err) {
      // Keep counting in memory; a disk that refuses once is reported once.
      saving = false
      logReliabilityEvent({ op: 'health-record-write', ok: false, detail: String(err) })
    }
  }
  save(beginRun(record, { now: now(), bootAt, previousAliveAt }))

  return {
    homeReady: () => save(markHomeReady(record, now())),
    end: (ending) => save(endRun(record, ending, now())),
    soundHeard: (sound) => save(recordSoundHeard(record, sound)),
    summary: (extras) => summarizeHealth(record, now(), extras),
    record: () => record
  }
}

let store: HealthStore | null = null

/** Called once from index.ts, before the heartbeat starts. */
export function startHealthRecord(
  userDataDir: string,
  opts: { now?: () => number; bootAt: number }
): HealthStore {
  store = createHealthStore(userDataDir, {
    now: opts.now ?? Date.now,
    bootAt: opts.bootAt,
    previousAliveAt: readLastHeartbeat(join(userDataDir, 'heartbeat.txt'))
  })
  return store
}

export function getHealthStore(): HealthStore | null {
  return store
}

/** Safe to call from any exit path, before or without startHealthRecord. */
export function endHealthRun(ending: RunEnding): void {
  store?.end(ending)
}
