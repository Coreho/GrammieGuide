import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HOME_RECOVERY_RECORD,
  restoreHomeRecoveryGiveUp,
  writeHomeRecoveryGiveUp
} from '../../src/main/services/reliability/homeRecoveryRecord'
import {
  clearReliabilityLog,
  getReliabilityLog
} from '../../src/main/services/reliability/reliabilityLog'

describe('Home recovery give-up record', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grammieguide-home-record-'))
    path = join(dir, HOME_RECOVERY_RECORD)
    clearReliabilityLog()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    clearReliabilityLog()
  })

  it('synchronously saves the time and detail, restores the log, and consumes the record once', () => {
    const detail = 'recovery limit reached; renderer gone: killed'
    const before = Date.now()
    writeHomeRecoveryGiveUp(dir, detail)
    const record = JSON.parse(readFileSync(path, 'utf8'))
    expect(record.detail).toBe(detail)
    expect(Date.parse(record.ts)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(record.ts)).toBeLessThanOrEqual(Date.now())
    expect(getReliabilityLog()).toEqual([])

    restoreHomeRecoveryGiveUp(dir)
    expect(getReliabilityLog()).toEqual([
      expect.objectContaining({
        op: 'home-recovery-gave-up',
        ok: false,
        detail: `Home recovery gave up before this restart at ${record.ts}; ${detail}`
      })
    ])
    expect(existsSync(path)).toBe(false)
    restoreHomeRecoveryGiveUp(dir)
    expect(getReliabilityLog()).toHaveLength(1)
  })

  it('allows startup when the record is missing', () => {
    expect(() => restoreHomeRecoveryGiveUp(dir)).not.toThrow()
    expect(getReliabilityLog()).toEqual([])
  })

  it('allows startup when the record cannot be read as a file', () => {
    mkdirSync(path)
    expect(() => restoreHomeRecoveryGiveUp(dir)).not.toThrow()
    expect(getReliabilityLog()).toEqual([])
  })

  it.each([
    'broken json',
    'null',
    '{}',
    '{"ts": 1, "detail": "failed"}',
    '{"ts": "not a date", "detail": "failed"}',
    '{"ts": "2026-09-30T12:00:00.000Z", "detail": 1}'
  ])('allows startup with an invalid record: %s', (contents) => {
    writeFileSync(path, contents, 'utf8')
    expect(() => restoreHomeRecoveryGiveUp(dir)).not.toThrow()
    expect(getReliabilityLog()).toEqual([])
  })

  it('does not prevent exit when writing fails', () => {
    mkdirSync(path)
    expect(() => writeHomeRecoveryGiveUp(dir, 'reload failed')).not.toThrow()
    expect(getReliabilityLog()).toEqual([
      expect.objectContaining({ op: 'home-recovery-record-write', ok: false })
    ])
  })
})
