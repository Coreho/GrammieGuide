/** Pure recovery decisions: a live main-process heartbeat cannot prove Home works. */
export const HOME_RECOVERY_LIMIT = 3
export const HOME_RECOVERY_WINDOW_MS = 5 * 60_000
export const HOME_UNRESPONSIVE_GRACE_MS = 10_000

export type HomeRecoveryState = {
  recoveryTimes: readonly number[]
  unresponsiveSince: number | null
}

export const INITIAL_HOME_RECOVERY_STATE: HomeRecoveryState = {
  recoveryTimes: [],
  unresponsiveSince: null
}

export type HomeRecoveryEvent = 'crashed' | 'unresponsive' | 'responsive' | 'check'
export type HomeRecoveryDecision = {
  state: HomeRecoveryState
  action: 'none' | 'reload' | 'give-up'
}

/** Injected time keeps the grace period and rolling retry budget testable without timers. */
export function decideHomeRecovery(
  prev: HomeRecoveryState,
  event: HomeRecoveryEvent,
  now: number
): HomeRecoveryDecision {
  const recoveryTimes = prev.recoveryTimes.filter((time) => now - time <= HOME_RECOVERY_WINDOW_MS)
  const unresponsiveSince =
    event === 'responsive'
      ? null
      : event === 'unresponsive'
        ? (prev.unresponsiveSince ?? now)
        : prev.unresponsiveSince
  const hangExpired =
    unresponsiveSince !== null && now - unresponsiveSince >= HOME_UNRESPONSIVE_GRACE_MS

  if (event !== 'crashed' && (event !== 'check' || !hangExpired)) {
    return { state: { recoveryTimes, unresponsiveSince }, action: 'none' }
  }

  // Count attempts, not successful loads: even a renderer that dies on every boot must stop retrying.
  if (recoveryTimes.length >= HOME_RECOVERY_LIMIT) {
    return { state: { recoveryTimes, unresponsiveSince: null }, action: 'give-up' }
  }
  return {
    state: { recoveryTimes: [...recoveryTimes, now], unresponsiveSince: null },
    action: 'reload'
  }
}
