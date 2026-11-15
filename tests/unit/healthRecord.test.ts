import { describe, expect, it } from 'vitest'
import {
  beginRun,
  emptyHealthRecord,
  endRun,
  KEEP_RUNS_MS,
  markHomeReady,
  MAX_RUNS,
  parseHealthRecord,
  parseSafetyLog,
  recordSoundHeard,
  summarizeHealth,
  WEEK_MS,
  type HealthRecord
} from '../../src/shared/health/healthRecord'

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
const T0 = Date.UTC(2026, 10, 1, 9)
const extras = {
  network: { online: true, since: T0 },
  safetyEvents: [],
  failedHelpRequests: [] as number[]
}

/** One run that started at `startedAt`, with Home ready a few seconds later. */
function started(
  record: HealthRecord,
  startedAt: number,
  previousAliveAt: number | null = null
): HealthRecord {
  return markHomeReady(
    beginRun(record, { now: startedAt, bootAt: T0 - DAY, previousAliveAt }),
    startedAt + 5_000
  )
}

describe('telling crashes, power loss and deliberate quits apart', () => {
  it('a run that ended itself keeps the ending it recorded', () => {
    let record = started(emptyHealthRecord(), T0)
    record = endRun(record, 'quit', T0 + HOUR)
    // Quitting also triggers before-quit's "closed"; the first ending wins.
    record = endRun(record, 'closed', T0 + HOUR + 1)
    record = started(record, T0 + 2 * HOUR)
    expect(record.runs[0]).toMatchObject({ ending: 'quit', endedAt: T0 + HOUR })
  })

  it('no ending and Windows booted after the last heartbeat is power loss', () => {
    let record = started(emptyHealthRecord(), T0)
    const lastBeat = T0 + HOUR
    record = beginRun(record, {
      now: T0 + 3 * HOUR,
      bootAt: T0 + 2 * HOUR,
      previousAliveAt: lastBeat
    })
    expect(record.runs[0]).toMatchObject({
      ending: 'power-loss',
      lastAliveAt: lastBeat,
      endedAt: lastBeat
    })
  })

  it('no ending in the same Windows session is the app stopping unexpectedly', () => {
    let record = started(emptyHealthRecord(), T0)
    record = beginRun(record, { now: T0 + 2 * HOUR, bootAt: T0 - DAY, previousAliveAt: T0 + HOUR })
    expect(record.runs[0]!.ending).toBe('stopped-unexpectedly')
  })

  it('ignores a heartbeat older than the run it would describe', () => {
    let record = started(emptyHealthRecord(), T0)
    record = beginRun(record, { now: T0 + HOUR, bootAt: T0 - DAY, previousAliveAt: T0 - DAY })
    expect(record.runs[0]).toMatchObject({
      lastAliveAt: T0 + 5_000,
      ending: 'stopped-unexpectedly'
    })
  })

  it('Home ready is recorded once, and never after the run ended', () => {
    let record = started(emptyHealthRecord(), T0)
    record = markHomeReady(record, T0 + HOUR)
    expect(record.runs[0]!.homeReadyAt).toBe(T0 + 5_000)
    const ended = markHomeReady(
      endRun(
        beginRun(emptyHealthRecord(), { now: T0, bootAt: 0, previousAliveAt: null }),
        'closed',
        T0
      ),
      T0 + 1
    )
    expect(ended.runs[0]!.homeReadyAt).toBeUndefined()
  })
})

describe('a fixed maximum size', () => {
  it('keeps at most MAX_RUNS runs, newest first to survive', () => {
    let record = emptyHealthRecord()
    for (let i = 0; i < MAX_RUNS + 50; i++) record = started(record, T0 + i * 60_000)
    expect(record.runs).toHaveLength(MAX_RUNS)
    expect(record.runs.at(-1)!.startedAt).toBe(T0 + (MAX_RUNS + 49) * 60_000)
    expect(parseHealthRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    // Every run that could be kept, at its largest, stays well under the store's read cap.
    expect(JSON.stringify(record).length).toBeLessThan(40 * 1024)
  })

  it('drops runs older than 30 days', () => {
    let record = started(emptyHealthRecord(), T0)
    record = started(record, T0 + KEEP_RUNS_MS + DAY)
    expect(record.runs.map((run) => run.startedAt)).toEqual([T0 + KEEP_RUNS_MS + DAY])
  })

  it('rejects anything this version did not write', () => {
    expect(parseHealthRecord({ version: 2, runs: [] })).toBeNull()
    expect(parseHealthRecord({ version: 1, runs: [{ startedAt: -1 }] })).toBeNull()
    expect(
      parseHealthRecord({ version: 1, runs: Array(MAX_RUNS + 1).fill({ startedAt: 1 }) })
    ).toBeNull()
    expect(parseHealthRecord('nonsense')).toBeNull()
  })
})

describe('counting the last 7 days', () => {
  it('counts each kind of ending separately, only within the week', () => {
    const now = T0 + 10 * DAY
    let record = emptyHealthRecord()
    // Too old to count.
    record = endRun(started(record, now - 9 * DAY), 'quit', now - 9 * DAY + HOUR)
    record = started(record, now - 6 * DAY) // will stop unexpectedly
    record = beginRun(record, {
      now: now - 5 * DAY,
      bootAt: 0,
      previousAliveAt: now - 6 * DAY + HOUR
    })
    record = markHomeReady(record, now - 5 * DAY + 1)
    record = endRun(record, 'home-gave-up', now - 4 * DAY)
    record = started(record, now - 3 * DAY) // will lose power
    record = beginRun(record, {
      now: now - 2 * DAY,
      bootAt: now - 2 * DAY - 60_000,
      previousAliveAt: now - 3 * DAY + HOUR
    })
    record = endRun(record, 'windows-session-end', now - DAY)
    record = started(record, now - HOUR)

    const summary = summarizeHealth(record, now, {
      ...extras,
      safetyEvents: [
        { at: now - 8 * DAY, type: 'watchdog-relaunch-succeeded' },
        { at: now - 6 * DAY, type: 'watchdog-hang-detected' },
        { at: now - 6 * DAY + 1, type: 'watchdog-relaunch-succeeded' }
      ],
      failedHelpRequests: [now - 2 * DAY, now - 20 * DAY]
    })
    expect(summary.week.stoppedUnexpectedly).toEqual({ count: 2, last: now - 4 * DAY })
    expect(summary.week.powerLoss).toEqual({ count: 1, last: now - 3 * DAY + HOUR })
    expect(summary.week.windowsSessionEnd).toEqual({ count: 1, last: now - DAY })
    expect(summary.week.closedOnPurpose).toEqual({ count: 0, last: null })
    expect(summary.week.watchdogRestarts).toEqual({ count: 1, last: now - 6 * DAY + 1 })
    expect(summary.week.failedHelpRequests).toEqual({ count: 1, last: now - 2 * DAY })
    expect(summary.current).toEqual({ startedAt: now - HOUR, homeReadyAt: now - HOUR + 5_000 })
    expect(summary.lastSuccessfulStartup).toBe(now - HOUR)
    expect(now - (now - 7 * DAY)).toBe(WEEK_MS)
  })

  it('reports unreadable request history as unknown, not as none', () => {
    const summary = summarizeHealth(started(emptyHealthRecord(), T0), T0, {
      ...extras,
      failedHelpRequests: null
    })
    expect(summary.week.failedHelpRequests).toBeNull()
  })

  it('remembers the last confirmed sound', () => {
    const record = recordSoundHeard(started(emptyHealthRecord(), T0), { at: T0 + 1, path: 'local' })
    expect(summarizeHealth(record, T0 + 2, extras).soundHeard).toEqual({
      at: T0 + 1,
      path: 'local'
    })
  })
})

describe('the watchdog log', () => {
  it('reads its lines and skips damaged ones', () => {
    const text =
      '﻿{"ts":"2026-11-01T09:00:00.000Z","type":"watchdog-hang-detected","detail":"x"}\r\n' +
      '{"ts":"2026-11-01T09:00:02.0000000-05:00","type":"watchdog-relaunch-succeeded"}\r\n' +
      '{not json\r\n{"type":"no-time"}\r\n'
    expect(parseSafetyLog(text)).toEqual([
      { at: Date.parse('2026-11-01T09:00:00.000Z'), type: 'watchdog-hang-detected' },
      { at: Date.parse('2026-11-01T14:00:02.000Z'), type: 'watchdog-relaunch-succeeded' }
    ])
  })
})
