/**
 * Rapid-tap confusion detection. Replaces the old app's flat count/window
 * check (App.jsx:264-279, 15 taps/3s) which risked false positives on an
 * enthusiastic tapper hitting several different tiles quickly. This
 * requires both frequency AND spatial clustering - mashing the same spot
 * repeatedly (a real frustration signal) trips it; excitedly tapping
 * across several different tiles does not.
 *
 * Pure functions so this is unit-testable without any DOM/renderer.
 */

export type TapRecord = { x: number; y: number; ts: number }

export type RapidTapConfig = {
  count: number
  windowMs: number
  clusterRadiusPx: number
  cooldownMs: number
}

export function pruneOldTaps(taps: TapRecord[], now: number, windowMs: number): TapRecord[] {
  return taps.filter((t) => now - t.ts <= windowMs)
}

export function isClustered(taps: TapRecord[], radiusPx: number): boolean {
  if (taps.length === 0) return true
  const centroidX = taps.reduce((sum, t) => sum + t.x, 0) / taps.length
  const centroidY = taps.reduce((sum, t) => sum + t.y, 0) / taps.length
  return taps.every((t) => {
    const dx = t.x - centroidX
    const dy = t.y - centroidY
    return Math.sqrt(dx * dx + dy * dy) <= radiusPx
  })
}

export function shouldTriggerConfusion(
  recentTaps: TapRecord[],
  config: RapidTapConfig,
  now: number
): boolean {
  const withinWindow = pruneOldTaps(recentTaps, now, config.windowMs)
  if (withinWindow.length < config.count) return false
  return isClustered(withinWindow, config.clusterRadiusPx)
}

/**
 * Stateful wrapper for renderer use: feed it taps as they happen, it tells
 * you whether to show the confusion overlay, honoring a cooldown so one
 * episode can't retrigger repeatedly while the user is still near the spot.
 */
export class RapidTapTracker {
  private taps: TapRecord[] = []
  private cooldownUntil = 0

  constructor(private config: RapidTapConfig) {}

  setConfig(config: RapidTapConfig): void {
    this.config = config
  }

  recordTap(x: number, y: number, now: number = Date.now()): boolean {
    this.taps = pruneOldTaps(this.taps, now, this.config.windowMs)
    this.taps.push({ x, y, ts: now })

    if (now < this.cooldownUntil) return false

    const triggered = shouldTriggerConfusion(this.taps, this.config, now)
    if (triggered) {
      this.cooldownUntil = now + this.config.cooldownMs
      this.taps = []
    }
    return triggered
  }
}
