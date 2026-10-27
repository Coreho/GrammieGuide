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
  { text: 'A little dance, just for fun!', clip: 'dance' },
  { text: 'Nice to see you, friend.', clip: 'agree' },
  { text: 'Hooray for friends!', clip: 'fist_pump' },
  { text: 'You and me make a good team!', clip: 'motivate' },
  { text: 'A big stretch and a happy smile.', clip: 'stretch' },
  { text: 'What a cozy spot we have here.', clip: 'look_around' }
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
