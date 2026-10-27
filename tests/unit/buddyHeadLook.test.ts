import { describe, expect, it } from 'vitest'
import {
  LOOK_DEPTH,
  LOOK_HOLD_MS,
  lookDurationMs,
  lookWeight,
  lookYaw
} from '../../src/shared/buddy/headLook'

describe("Buddy's glance toward her tap", () => {
  it('turns toward the side she tapped, relative to where his body faces', () => {
    expect(lookYaw(1, 0, 'roam')).toBeCloseTo(Math.atan2(1, LOOK_DEPTH))
    expect(lookYaw(-1, 0, 'roam')).toBeLessThan(0)
    expect(lookYaw(0, 0, 'roam')).toBe(0)
    // Already facing that way while walking: little or no extra turn.
    expect(Math.abs(lookYaw(3, Math.atan2(3, LOOK_DEPTH), 'roam'))).toBeLessThan(1e-9)
  })

  it('never twists further than a neck could, and less in reduced motion', () => {
    expect(lookYaw(100, 0, 'roam')).toBe(0.6)
    expect(lookYaw(-100, 1.05, 'still')).toBe(-0.6)
    expect(lookYaw(100, 0, 'reduced')).toBe(0.3)
  })

  it('eases in, holds, eases out and ends', () => {
    expect(lookWeight(-5, 'roam')).toBe(0)
    expect(lookWeight(0, 'roam')).toBe(0)
    expect(lookWeight(150, 'roam')).toBeGreaterThan(0)
    expect(lookWeight(150, 'roam')).toBeLessThan(1)
    expect(lookWeight(300 + LOOK_HOLD_MS / 2, 'roam')).toBe(1)
    expect(lookWeight(lookDurationMs('roam') - 100, 'roam')).toBeGreaterThan(0)
    expect(lookWeight(lookDurationMs('roam'), 'roam')).toBe(0)
    expect(lookWeight(60_000, 'roam')).toBe(0)
  })

  it('moves more slowly in reduced motion', () => {
    expect(lookWeight(300, 'reduced')).toBeLessThan(lookWeight(300, 'roam'))
    expect(lookDurationMs('reduced')).toBeGreaterThan(lookDurationMs('roam'))
  })
})
