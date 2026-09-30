import type { ClipName } from './commands'
import type { BuddyMotion } from './buddyMachine'

export type TapReaction = { text: string; clip: ClipName }

// Each line belongs with its gesture. No questions, dates, weather, or claims
// about her circumstances: a tap should feel friendly without needing a reply.
export const TAP_REACTIONS: readonly TapReaction[] = [
  { text: 'Hello, friend!', clip: 'wave' },
  { text: 'A big hello from Buddy!', clip: 'big_wave' },
  { text: 'Sending a little love your way.', clip: 'heart' },
  { text: 'A little hop of happiness!', clip: 'happy_jump' },
  { text: 'A little cheer from me to you!', clip: 'cheer' },
  { text: 'A little bow, just for you.', clip: 'bow' },
  { text: 'A little dance, just for fun!', clip: 'dance' }
]

export function pickTapReaction(
  previous: TapReaction | null,
  random: () => number = Math.random,
  motion: BuddyMotion = 'roam'
): TapReaction {
  // Filtering before picking also avoids repeats with deterministic randomness.
  const choices = TAP_REACTIONS.filter(
    (reaction) =>
      (motion !== 'reduced' || reaction.clip === 'wave' || reaction.clip === 'heart') &&
      reaction.text !== previous?.text &&
      reaction.clip !== previous?.clip
  )
  return choices[Math.floor(random() * choices.length)]!
}
