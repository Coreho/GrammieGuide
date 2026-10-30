import type { BuddyMotion } from './buddyMachine'

/**
 * Buddy turning his head toward where she just tapped, on top of whatever
 * clip is playing. Pure numbers here; CatModel applies them to his Head bone.
 *
 * The turn is relative to his body, so a cat walking one way never twists
 * his head past what a neck could do, and reduced motion keeps it small and
 * slow rather than dropping it: a glance is still a sign he noticed.
 */

/** How far she sits in front of the screen, in his world units: sets how sharply he turns. */
export const LOOK_DEPTH = 3
const MAX_TURN = { normal: 0.6, reduced: 0.3 }
const EASE_IN_MS = { normal: 300, reduced: 700 }
export const LOOK_HOLD_MS = 2000
const EASE_OUT_MS = { normal: 800, reduced: 1200 }

function speed(motion: BuddyMotion): 'normal' | 'reduced' {
  return motion === 'reduced' ? 'reduced' : 'normal'
}

/** Head turn in radians (positive toward +x), from his body's facing toward a point `dx` away. */
export function lookYaw(dx: number, bodyYaw: number, motion: BuddyMotion): number {
  const max = MAX_TURN[speed(motion)]
  const wanted = Math.atan2(dx, LOOK_DEPTH) - bodyYaw
  return Math.max(-max, Math.min(max, wanted))
}

/** 0..1: how much of the turn applies `elapsedMs` after the tap. */
export function lookWeight(elapsedMs: number, motion: BuddyMotion): number {
  const s = speed(motion)
  if (elapsedMs < 0) return 0
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  if (elapsedMs < EASE_IN_MS[s]) return smooth(elapsedMs / EASE_IN_MS[s])
  const out = elapsedMs - EASE_IN_MS[s] - LOOK_HOLD_MS
  if (out <= 0) return 1
  return out >= EASE_OUT_MS[s] ? 0 : 1 - smooth(out / EASE_OUT_MS[s])
}

/** When the glance is completely over. */
export function lookDurationMs(motion: BuddyMotion): number {
  const s = speed(motion)
  return EASE_IN_MS[s] + LOOK_HOLD_MS + EASE_OUT_MS[s]
}
