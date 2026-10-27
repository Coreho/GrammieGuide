import { z } from 'zod'
import type { ClipName } from './commands'
import type { BuddyMotion } from './buddyMachine'

/**
 * Gestures she can ask Buddy for in chat ("Buddy, dance!"). The caregiver
 * menu and admin commands could already make him move; this is the first
 * way she can, with no new buttons to learn.
 *
 * Like the fixed Home actions, a whole explicit request is recognized here,
 * before any model, network or key; other wording reaches the same gestures
 * through the `do_a_gesture` tool, whose text is never used. Replies are
 * fixed lines: nothing to answer, nothing claimed.
 */

export const BUDDY_GESTURES = [
  'dance',
  'wave',
  'bow',
  'jump',
  'cheer',
  'heart',
  'stretch',
  'trick'
] as const
export type BuddyGesture = (typeof BUDDY_GESTURES)[number]

const GESTURES: Record<BuddyGesture, { clips: readonly ClipName[]; reply: string }> = {
  dance: { clips: ['dance'], reply: "Here's a little dance for you!" },
  wave: { clips: ['big_wave'], reply: 'A big wave, just for you!' },
  bow: { clips: ['bow'], reply: 'A little bow, just for you.' },
  jump: { clips: ['happy_jump'], reply: "Here's a happy hop!" },
  cheer: { clips: ['cheer'], reply: 'Hooray! A big cheer for you!' },
  heart: { clips: ['heart'], reply: 'Sending you a big heart.' },
  stretch: { clips: ['stretch'], reply: 'Ahh, a nice big stretch.' },
  trick: {
    clips: ['happy_jump', 'fist_pump', 'motivate', 'cheer', 'dance'],
    reply: "Here's a little trick for you!"
  }
}

/** Reduced motion keeps the same two calm gestures her taps get. */
const CALM_REPLY = "Here's a friendly wave for you."

export type GesturePerformance = { clip: ClipName; reply: string }

export function performGesture(
  gesture: BuddyGesture,
  motion: BuddyMotion,
  random: () => number = Math.random
): GesturePerformance {
  const { clips, reply } = GESTURES[gesture]
  if (motion === 'reduced') {
    if (gesture === 'heart') return { clip: 'heart', reply }
    return { clip: 'wave', reply: gesture === 'wave' ? reply : CALM_REPLY }
  }
  return { clip: clips[Math.floor(random() * clips.length)] ?? clips[0]!, reply }
}

const WORDS: Record<string, BuddyGesture> = {
  dance: 'dance',
  wave: 'wave',
  bow: 'bow',
  jump: 'jump',
  hop: 'jump',
  cheer: 'cheer',
  heart: 'heart',
  stretch: 'stretch',
  trick: 'trick'
}

const ASK = /^(?:please |can you |could you |would you |will you |i'd like you to |i want you to )+/
const TAIL = /(?: for me| for us| please| again| now| one more time)+$/
// "do a little dance", "show me your dance moves", "give me a big wave"
const NOUN =
  /^(?:(?:do|show me|give me|let's see|let me see) )?(?:a |an |the |your |some )?(?:little |big |happy |silly |funny |fun |nice |magic )?(dance|wave|bow|jump|hop|cheer|stretch|trick|heart)(?: moves?)?$/
// "dance", "wave to me", "jump up and down", "let's dance"
const VERB =
  /^(?:let's |let us )?(dance|wave|bow|jump|hop|cheer|stretch)(?: (?:to me|at me|hello|hi|goodbye|around|a little|up and down|with me))?$/

/**
 * The whole message must be the request, so "I used to dance with my
 * husband" stays conversation. Returns null for anything else.
 */
export function explicitGestureRequest(value: string): BuddyGesture | null {
  const text = value
    .toLowerCase()
    .replace(/’/g, "'")
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:hey |oh )?buddy,? /, '')
    .replace(/,? buddy$/, '')
    .replace(ASK, '')
    .replace(TAIL, '')
    .replace(/,$/, '')
    .trim()
  if (/^take a bow$/.test(text)) return 'bow'
  if (
    /^(?:blow (?:me )?a kiss|give me a (?:hug|kiss)|send (?:me )?(?:some |a little )?love)$/.test(
      text
    )
  )
    return 'heart'
  if (/^do something (?:fun|silly|funny)$/.test(text)) return 'trick'
  const match = NOUN.exec(text) ?? VERB.exec(text)
  if (!match) return null
  // "moves" belongs to dancing only; "show me your wave moves" is not a request we know.
  if (/ moves?$/.test(text) && match[1] !== 'dance') return null
  return WORDS[match[1]!] ?? null
}

export const gestureToolSchema = z.object({ gesture: z.enum(BUDDY_GESTURES) }).strict()

export function gestureFromTool(name: string, input: unknown): BuddyGesture | null {
  if (name !== 'do_a_gesture') return null
  const parsed = gestureToolSchema.safeParse(input)
  return parsed.success ? parsed.data.gesture : null
}
