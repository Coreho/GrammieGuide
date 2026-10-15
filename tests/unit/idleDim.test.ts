import { describe, it, expect } from 'vitest'
import {
  isIdleDimBlocked,
  shouldDimHome,
  type IdleDimBlockers,
  type IdleDimSettings
} from '../../src/shared/idleDim'

const MINUTE = 60_000
const START = 1_000_000
const on: IdleDimSettings = { enabled: true, afterMinutes: 10, level: 0.3 }

describe('idle dimming: timing', () => {
  it('never dims when the caregiver has not turned it on', () => {
    expect(shouldDimHome({ ...on, enabled: false }, START, START + 60 * MINUTE)).toBe(false)
  })

  it('dims exactly when the chosen idle time is reached, and stays dimmed', () => {
    expect(shouldDimHome(on, START, START + 10 * MINUTE - 1)).toBe(false)
    expect(shouldDimHome(on, START, START + 10 * MINUTE)).toBe(true)
    expect(shouldDimHome(on, START, START + 25 * MINUTE)).toBe(true)
  })

  it('a new tap restarts the idle time', () => {
    const tappedAt = START + 15 * MINUTE
    expect(shouldDimHome(on, START, tappedAt)).toBe(true)
    expect(shouldDimHome(on, tappedAt, tappedAt)).toBe(false)
    expect(shouldDimHome(on, tappedAt, tappedAt + 10 * MINUTE)).toBe(true)
  })

  it('a clock that went backwards, or a zero time, never dims', () => {
    expect(shouldDimHome(on, START + 5_000, START)).toBe(false)
    expect(shouldDimHome({ ...on, afterMinutes: 0 }, START, START + 10 * MINUTE)).toBe(false)
  })
})

describe('idle dimming: never mid-use', () => {
  it.each<keyof IdleDimBlockers>(['embeddedWebOpen', 'buddyChatOpen', 'audioHold', 'contactFlow'])(
    'never dims while %s',
    (blocker) => {
      const blockers = { [blocker]: true }
      expect(isIdleDimBlocked(blockers)).toBe(true)
      expect(shouldDimHome(on, START, START + 60 * MINUTE, blockers)).toBe(false)
    }
  )

  it('music on its own is no hold, so Home may dim while it plays', () => {
    const musicOnly: IdleDimBlockers = {
      embeddedWebOpen: false,
      buddyChatOpen: false,
      audioHold: false,
      contactFlow: false
    }
    expect(isIdleDimBlocked(musicOnly)).toBe(false)
    expect(shouldDimHome(on, START, START + 10 * MINUTE, musicOnly)).toBe(true)
  })
})
