import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mocks = vi.hoisted(() => ({ log: vi.fn() }))
vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({
  logReliabilityEvent: mocks.log
}))
import {
  createHealthStore,
  type HealthStore,
  HEALTH_CORRUPT_FILE,
  HEALTH_FILE,
  KEEP_SAFETY_LINES,
  MAX_HEALTH_FILE_BYTES,
  MAX_SAFETY_LOG_BYTES,
  readLastHeartbeat,
  readSafetyEvents,
  SAFETY_LOG
} from '../../src/main/services/health/healthStore'
import { MAX_RUNS } from '../../src/shared/health/healthRecord'

const T0 = Date.UTC(2026, 10, 1, 9)
const extras = { network: { online: true, since: T0 }, safetyEvents: [], failedHelpRequests: [] }
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grammie-health-'))
  mocks.log.mockReset()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function open(
  now: number,
  previousAliveAt: number | null = null,
  bootAt = T0 - 86_400_000
): HealthStore {
  return createHealthStore(dir, { now: () => now, bootAt, previousAliveAt })
}

describe('the saved health record', () => {
  it('survives a restart and classifies the run that never ended', () => {
    const first = open(T0)
    first.homeReady()
    // The app died: no ending was written. The next start finds its last heartbeat.
    const second = open(T0 + 3_600_000, T0 + 600_000)
    expect(second.record().runs).toHaveLength(2)
    expect(second.record().runs[0]).toMatchObject({
      homeReadyAt: T0,
      ending: 'stopped-unexpectedly',
      endedAt: T0 + 600_000
    })
    expect(second.summary(extras).week.stoppedUnexpectedly.count).toBe(1)
    const onDisk = JSON.parse(readFileSync(join(dir, HEALTH_FILE), 'utf8'))
    expect(onDisk.runs).toHaveLength(2)
    expect(existsSync(join(dir, `${HEALTH_FILE}.tmp`))).toBe(false)
  })

  it('saves endings and the confirmed sound immediately', () => {
    const store = open(T0)
    store.soundHeard({ at: T0 + 1, path: 'windows' })
    store.end('quit')
    const reopened = open(T0 + 10)
    expect(reopened.record().runs[0]!.ending).toBe('quit')
    expect(reopened.summary(extras).soundHeard).toEqual({ at: T0 + 1, path: 'windows' })
  })

  it('stays under its size cap however many times the app starts', () => {
    for (let i = 0; i < MAX_RUNS + 30; i++) open(T0 + i * 60_000, T0 + i * 60_000 - 1).homeReady()
    const size = statSync(join(dir, HEALTH_FILE)).size
    expect(size).toBeLessThan(MAX_HEALTH_FILE_BYTES)
    expect(open(T0 + 10 * 86_400_000).record().runs).toHaveLength(MAX_RUNS)
  })

  it('sets a damaged file aside and starts again, without blocking startup', () => {
    writeFileSync(join(dir, HEALTH_FILE), '{"version":1,"runs":[', 'utf8')
    const store = open(T0)
    expect(store.record().runs).toHaveLength(1)
    expect(readFileSync(join(dir, HEALTH_CORRUPT_FILE), 'utf8')).toBe('{"version":1,"runs":[')
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ op: 'health-record-reset' }))
  })

  it('refuses to read an oversized file', () => {
    writeFileSync(join(dir, HEALTH_FILE), ' '.repeat(MAX_HEALTH_FILE_BYTES + 1), 'utf8')
    expect(open(T0).record().runs).toHaveLength(1)
    expect(statSync(join(dir, HEALTH_FILE)).size).toBeLessThan(1024)
  })

  it('keeps counting in memory when the disk refuses, and says so once', () => {
    // A folder where the file should be makes every write fail.
    rmSync(dir, { recursive: true, force: true })
    const store = createHealthStore(join(dir, 'missing'), {
      now: () => T0,
      bootAt: 0,
      previousAliveAt: null
    })
    store.end('quit')
    expect(store.record().runs[0]!.ending).toBe('quit')
    expect(
      mocks.log.mock.calls.filter(([event]) => event.op === 'health-record-write')
    ).toHaveLength(1)
  })
})

describe('reading what the watchdog and heartbeat left behind', () => {
  it('reads the last heartbeat, falling back to when it was written', () => {
    const path = join(dir, 'heartbeat.txt')
    expect(readLastHeartbeat(path)).toBeNull()
    writeFileSync(path, String(T0), 'utf8')
    expect(readLastHeartbeat(path)).toBe(T0)
    writeFileSync(path, 'garbled', 'utf8')
    expect(readLastHeartbeat(path)).toBe(statSync(path).mtimeMs)
  })

  it('trims an overgrown watchdog log to its newest lines', () => {
    const line = (i: number): string =>
      JSON.stringify({
        ts: new Date(T0 + i * 60_000).toISOString(),
        type: 'watchdog-relaunch-succeeded',
        detail: 'C:\\Program Files\\GrammieGuide\\GrammieGuide.exe'
      })
    const total = 2_000
    writeFileSync(
      join(dir, SAFETY_LOG),
      Array.from({ length: total }, (_, i) => line(i)).join('\r\n')
    )
    expect(statSync(join(dir, SAFETY_LOG)).size).toBeGreaterThan(MAX_SAFETY_LOG_BYTES)
    const events = readSafetyEvents(dir)
    expect(events).toHaveLength(KEEP_SAFETY_LINES)
    expect(events.at(-1)!.at).toBe(T0 + (total - 1) * 60_000)
    expect(statSync(join(dir, SAFETY_LOG)).size).toBeLessThan(MAX_SAFETY_LOG_BYTES)
    expect(readSafetyEvents(dir)).toEqual(events)
  })

  it('treats a missing watchdog log as no restarts', () => {
    expect(readSafetyEvents(dir)).toEqual([])
  })
})
