import type { IdleDimConfig } from './configSchema'

/**
 * Optional gentle dimming of Home when nobody has used it for a while (TASK-53).
 * Pure, so the timing rules are tested with a fake clock; the launcher's
 * useIdleDim hook feeds it real input and the blockers below.
 */

export type IdleDimSettings = IdleDimConfig

/** While any of these is true Home never dims, and the idle time starts again afterwards. */
export interface IdleDimBlockers {
  /**
   * An embedded web page is open. Its native view draws above Home, so an
   * overlay couldn't dim it anyway, and the page already closes itself when idle.
   */
  embeddedWebOpen?: boolean
  /** The Buddy chat panel is open. */
  buddyChatOpen?: boolean
  /**
   * The audio coordinator holds sound for something in use: Buddy speaking or
   * listening, a photo's narration, a chat or an audible page. Music alone is
   * not a hold, so music-only playback may dim.
   */
  audioHold?: boolean
  /** Reserved for TASK-22's help request flow, which doesn't exist yet. */
  contactFlow?: boolean
}

export function isIdleDimBlocked(blockers: IdleDimBlockers): boolean {
  return Boolean(
    blockers.embeddedWebOpen || blockers.buddyChatOpen || blockers.audioHold || blockers.contactFlow
  )
}

/**
 * True once Home has been idle for the caregiver's chosen time. A clock that
 * went backwards never dims.
 */
export function shouldDimHome(
  settings: IdleDimSettings,
  lastActivityAt: number,
  now: number,
  blockers: IdleDimBlockers = {}
): boolean {
  if (!settings.enabled || isIdleDimBlocked(blockers)) return false
  if (settings.afterMinutes <= 0 || now < lastActivityAt) return false
  return now - lastActivityAt >= settings.afterMinutes * 60_000
}
