import { readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { logReliabilityEvent } from './reliabilityLog'

export const HOME_RECOVERY_RECORD = 'home-recovery-gave-up.json'

export function writeHomeRecoveryGiveUp(userDataDir: string, detail: string): void {
  try {
    // Exit follows immediately, so an asynchronous write could lose the reason.
    writeFileSync(
      join(userDataDir, HOME_RECOVERY_RECORD),
      JSON.stringify({ ts: new Date().toISOString(), detail }),
      'utf8'
    )
  } catch (err) {
    logReliabilityEvent({ op: 'home-recovery-record-write', ok: false, detail: String(err) })
  }
}

export function restoreHomeRecoveryGiveUp(userDataDir: string): void {
  let record: unknown
  const path = join(userDataDir, HOME_RECOVERY_RECORD)
  try {
    record = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // Missing, unreadable or damaged diagnostics must never prevent Home from starting.
    return
  }
  if (
    typeof record !== 'object' ||
    record === null ||
    !('ts' in record) ||
    typeof record.ts !== 'string' ||
    !Number.isFinite(Date.parse(record.ts)) ||
    !('detail' in record) ||
    typeof record.detail !== 'string'
  ) {
    return
  }

  logReliabilityEvent({
    op: 'home-recovery-gave-up',
    ok: false,
    detail: `Home recovery gave up before this restart at ${record.ts}; ${record.detail}`
  })
  try {
    rmSync(path, { force: true })
  } catch (err) {
    logReliabilityEvent({ op: 'home-recovery-record-clear', ok: false, detail: String(err) })
  }
}
