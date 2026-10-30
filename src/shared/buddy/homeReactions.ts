import type { ClipName } from './commands'

/**
 * Small things Buddy does when she does something on Home, so he seems to
 * notice her without asking anything of her. Coming back from a web page
 * needs nothing here: his floor is rebuilt with Home and greets her anyway.
 *
 * Each reaction is one short gesture from the calm set (wave, heart), so
 * reduced motion keeps it as it is. The machine decides whether he's free to react and
 * rate limits it (REACTION_GAP_MS).
 */

export type HomeEvent = 'builtinClosed' | 'photosClosed'

const REACTIONS: Record<HomeEvent, ClipName> = {
  // Back from Weather, News, Music...: a small welcome back.
  builtinClosed: 'wave',
  // After looking at her pictures: something warm.
  photosClosed: 'heart'
}

export function reactionFor(event: HomeEvent): ClipName {
  return REACTIONS[event]
}

/** Quick back-and-forth between views must not make him jumpy. */
export const REACTION_GAP_MS = 20_000

/** His first idle moment of each morning; reduced motion skips it. */
export const MORNING_CLIP: ClipName = 'big_stretch'

/** 6 AM to noon. Night ends at six (isNight), so the first morning hour counts. */
export function isMorning(hour: number): boolean {
  return hour >= 6 && hour < 12
}
