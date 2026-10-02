import { describe, it, expect } from 'vitest'
import {
  decideHomeRecovery,
  INITIAL_HOME_RECOVERY_STATE,
  HOME_RECOVERY_LIMIT,
  HOME_RECOVERY_WINDOW_MS,
  HOME_UNRESPONSIVE_GRACE_MS,
  type HomeRecoveryState
} from '../../src/main/services/reliability/homeRecovery'

describe('Home recovery decisions', () => {
  const t0 = 1_000_000

  it('reloads immediately after a single crash', () => {
    expect(decideHomeRecovery(INITIAL_HOME_RECOVERY_STATE, 'crashed', t0)).toEqual({
      state: { recoveryTimes: [t0], unresponsiveSince: null },
      action: 'reload'
    })
  })

  it('waits the full grace period before reloading a hang', () => {
    const hung = decideHomeRecovery(INITIAL_HOME_RECOVERY_STATE, 'unresponsive', t0)
    expect(hung.action).toBe('none')
    expect(hung.state.recoveryTimes).toEqual([])
    expect(
      decideHomeRecovery(hung.state, 'check', t0 + HOME_UNRESPONSIVE_GRACE_MS - 1).action
    ).toBe('none')
    expect(decideHomeRecovery(hung.state, 'check', t0 + HOME_UNRESPONSIVE_GRACE_MS)).toEqual({
      state: { recoveryTimes: [t0 + HOME_UNRESPONSIVE_GRACE_MS], unresponsiveSince: null },
      action: 'reload'
    })
  })

  it('cancels when responsive arrives before the grace period, even if a stale check follows', () => {
    const hung = decideHomeRecovery(INITIAL_HOME_RECOVERY_STATE, 'unresponsive', t0)
    const responsive = decideHomeRecovery(hung.state, 'responsive', t0 + 5000)
    expect(responsive).toEqual({ state: INITIAL_HOME_RECOVERY_STATE, action: 'none' })
    expect(
      decideHomeRecovery(responsive.state, 'check', t0 + HOME_UNRESPONSIVE_GRACE_MS).action
    ).toBe('none')
    const hungAgain = decideHomeRecovery(responsive.state, 'unresponsive', t0 + 6000)
    expect(hungAgain.state.unresponsiveSince).toBe(t0 + 6000)
  })

  it('repeated unresponsive notifications do not extend the grace period', () => {
    const hung = decideHomeRecovery(INITIAL_HOME_RECOVERY_STATE, 'unresponsive', t0)
    const repeated = decideHomeRecovery(hung.state, 'unresponsive', t0 + 5000)
    expect(repeated.state.unresponsiveSince).toBe(t0)
    expect(
      decideHomeRecovery(repeated.state, 'check', t0 + HOME_UNRESPONSIVE_GRACE_MS).action
    ).toBe('reload')
  })

  it('a crash during a hang reloads immediately and clears the pending hang', () => {
    const hung = decideHomeRecovery(INITIAL_HOME_RECOVERY_STATE, 'unresponsive', t0)
    const crashed = decideHomeRecovery(hung.state, 'crashed', t0 + 5000)
    expect(crashed.action).toBe('reload')
    expect(crashed.state.unresponsiveSince).toBeNull()
    expect(decideHomeRecovery(crashed.state, 'check', t0 + HOME_UNRESPONSIVE_GRACE_MS).action).toBe(
      'none'
    )
  })

  it('allows three recoveries and gives up on the fourth inside five minutes', () => {
    let state = INITIAL_HOME_RECOVERY_STATE
    for (let i = 0; i < HOME_RECOVERY_LIMIT; i++) {
      const decision = decideHomeRecovery(state, 'crashed', t0 + i * 1000)
      expect(decision.action).toBe('reload')
      state = decision.state
    }
    const fourth = decideHomeRecovery(state, 'crashed', t0 + 3000)
    expect(fourth.action).toBe('give-up')
    expect(fourth.state.recoveryTimes).toHaveLength(HOME_RECOVERY_LIMIT)
  })

  it('shares the retry budget between crashes and hangs, without resetting on responsive', () => {
    const state: HomeRecoveryState = {
      recoveryTimes: [t0, t0 + 1000, t0 + 2000],
      unresponsiveSince: null
    }
    const responsive = decideHomeRecovery(state, 'responsive', t0 + 3000)
    const hung = decideHomeRecovery(responsive.state, 'unresponsive', t0 + 4000)
    expect(hung.action).toBe('none')
    expect(
      decideHomeRecovery(hung.state, 'check', t0 + 4000 + HOME_UNRESPONSIVE_GRACE_MS).action
    ).toBe('give-up')
  })

  it('keeps reloading when recoveries are spread over more than five minutes', () => {
    let state = INITIAL_HOME_RECOVERY_STATE
    for (let i = 0; i < 6; i++) {
      const now = t0 + i * (HOME_RECOVERY_WINDOW_MS + 1)
      const decision = decideHomeRecovery(state, 'crashed', now)
      expect(decision.action).toBe('reload')
      expect(decision.state.recoveryTimes).toEqual([now])
      state = decision.state
    }
  })

  it('includes the five-minute boundary and expires old attempts one millisecond later', () => {
    const state: HomeRecoveryState = {
      recoveryTimes: [t0, t0 + 1000, t0 + 2000],
      unresponsiveSince: null
    }
    expect(decideHomeRecovery(state, 'crashed', t0 + HOME_RECOVERY_WINDOW_MS).action).toBe(
      'give-up'
    )
    expect(decideHomeRecovery(state, 'crashed', t0 + HOME_RECOVERY_WINDOW_MS + 1).action).toBe(
      'reload'
    )
    expect(state.recoveryTimes).toEqual([t0, t0 + 1000, t0 + 2000])
  })
})
