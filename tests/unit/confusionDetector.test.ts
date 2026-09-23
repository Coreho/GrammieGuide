import { describe, it, expect } from 'vitest'
import { shouldTriggerConfusion, RapidTapTracker, type RapidTapConfig } from '../../src/shared/confusionDetector'

const config: RapidTapConfig = { count: 5, windowMs: 3000, clusterRadiusPx: 80, cooldownMs: 5000 }

describe('shouldTriggerConfusion', () => {
  it('does not trigger when taps are spread across different tiles (excited tapper)', () => {
    const now = 10_000
    const taps = [
      { x: 50, y: 50, ts: now - 100 },
      { x: 500, y: 50, ts: now - 200 },
      { x: 50, y: 500, ts: now - 300 },
      { x: 500, y: 500, ts: now - 400 },
      { x: 250, y: 250, ts: now - 500 }
    ]
    expect(shouldTriggerConfusion(taps, config, now)).toBe(false)
  })

  it('triggers when taps mash the same spot (frustration signal)', () => {
    const now = 10_000
    const taps = Array.from({ length: 5 }, (_, i) => ({ x: 100 + i, y: 100 + i, ts: now - i * 50 }))
    expect(shouldTriggerConfusion(taps, config, now)).toBe(true)
  })

  it('does not trigger below the count threshold even if clustered', () => {
    const now = 10_000
    const taps = [
      { x: 100, y: 100, ts: now - 10 },
      { x: 101, y: 101, ts: now - 20 }
    ]
    expect(shouldTriggerConfusion(taps, config, now)).toBe(false)
  })

  it('ignores taps outside the time window', () => {
    const now = 10_000
    const taps = [
      { x: 100, y: 100, ts: now - 10 },
      { x: 100, y: 100, ts: now - 20 },
      { x: 100, y: 100, ts: now - 30 },
      { x: 100, y: 100, ts: now - 40 },
      { x: 100, y: 100, ts: now - 5000 } // outside 3000ms window
    ]
    expect(shouldTriggerConfusion(taps, config, now)).toBe(false)
  })
})

describe('RapidTapTracker', () => {
  it('triggers once on a mash, then honors cooldown before it can trigger again', () => {
    const tracker = new RapidTapTracker(config)
    let now = 0
    let triggeredCount = 0
    for (let i = 0; i < 5; i++) {
      now += 50
      if (tracker.recordTap(100, 100, now)) triggeredCount++
    }
    expect(triggeredCount).toBe(1)

    // Immediately mash again - should be suppressed by cooldown.
    for (let i = 0; i < 5; i++) {
      now += 50
      tracker.recordTap(100, 100, now)
    }
    expect(tracker.recordTap(100, 100, now)).toBe(false)

    // After cooldown elapses, a fresh mash can trigger again.
    now += config.cooldownMs + 1
    let triggeredAgain = false
    for (let i = 0; i < 5; i++) {
      now += 50
      if (tracker.recordTap(100, 100, now)) triggeredAgain = true
    }
    expect(triggeredAgain).toBe(true)
  })
})
