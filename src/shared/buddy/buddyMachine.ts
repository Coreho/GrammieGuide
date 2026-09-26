import { setup, assign } from 'xstate'
import { farewellLine, greetingFor, pickRemark, type RemarkWeather } from './remarks'

/**
 * Buddy's behavior: what he's doing right now, as a state machine. Pure
 * logic - no three.js, no DOM - so it's unit tested with a simulated clock
 * (tests/unit/buddyMachine.test.ts). The renderer turns each state into an
 * animation clip and a place on his floor, and reports back when a clip
 * finishes (CLIP_DONE) or he reaches where he was walking to (ARRIVED).
 *
 * Calm by default, as the plan requires: long stretches of plain idling,
 * the occasional fidget, a stroll every minute or so if the caregiver
 * allows roaming, and no unprompted talking unless chattiness is turned on.
 * At night he stays put and fidgets rarely.
 *
 * Positions are fractions (0 = left end of his floor, 1 = right end) so this
 * file never needs to know screen sizes.
 */

export type Chattiness = 'off' | 'low' | 'normal'
export type ChatPhase = 'idle' | 'hearing' | 'thinking' | 'speaking'

export type BuddyContext = {
  random: () => number
  now: () => number
  roaming: boolean
  chattiness: Chattiness
  hour: number
  weather: RemarkWeather | null
  /** Where he is (last place he arrived), 0..1. */
  position: number
  /** Where he should be; the renderer walks him there if it isn't `position`. */
  target: number
  chatPhase: ChatPhase
  bubble: string | null
  recentRemarks: string[]
  nextStrollAt: number
  nextRemarkAt: number
}

export type BuddyEvent =
  | { type: 'CLIP_DONE' }
  | { type: 'ARRIVED'; at: number }
  | { type: 'CHAT_OPEN' }
  | { type: 'CHAT_CLOSE' }
  | { type: 'CHAT_PHASE'; phase: ChatPhase }
  | { type: 'PET' }
  | { type: 'SETTINGS'; roaming: boolean; chattiness: Chattiness; hour: number; weather: RemarkWeather | null }

export type BuddyInput = {
  random?: () => number
  now?: () => number
  roaming: boolean
  chattiness: Chattiness
  hour: number
  weather?: RemarkWeather | null
  /** Where he starts, 0..1. */
  position?: number
}

/** Where he stands while the chat panel is open: right of the panel, in view. */
export const CHAT_SPOT = 0.82
export const FLOOR_MIN = 0.06
export const FLOOR_MAX = 0.94

const SECOND = 1000
const MINUTE = 60 * SECOND
/** How long a remark stays in its bubble. */
export const REMARK_MS = 9 * SECOND
/** Safety net for one-shot clips that never report back. */
export const CLIP_TIMEOUT_MS = 20 * SECOND

/** 9 PM to 6 AM: he stays put and keeps quiet. Ends early because she may well be up at six. */
export function isNight(hour: number): boolean {
  return hour >= 21 || hour < 6
}

function between(random: () => number, lo: number, hi: number): number {
  return lo + random() * (hi - lo)
}

/** Time between unprompted remarks; Infinity when chattiness is off. */
export function remarkGap(chattiness: Chattiness, random: () => number): number {
  if (chattiness === 'low') return between(random, 6 * MINUTE, 10 * MINUTE)
  if (chattiness === 'normal') return between(random, 2 * MINUTE, 4 * MINUTE)
  return Infinity
}

function strollGap(random: () => number): number {
  return between(random, 30 * SECOND, 75 * SECOND)
}

/** A new spot at least a body-width or two away, so a stroll is a real stroll. */
export function pickStrollTarget(from: number, random: () => number): number {
  const span = FLOOR_MAX - FLOOR_MIN
  for (let i = 0; i < 8; i++) {
    const to = FLOOR_MIN + random() * span
    if (Math.abs(to - from) >= 0.18) return to
  }
  // Nowhere far enough by chance: head for whichever end is farther.
  return from - FLOOR_MIN > FLOOR_MAX - from ? FLOOR_MIN : FLOOR_MAX
}

export const buddyMachine = setup({
  types: {} as { context: BuddyContext; events: BuddyEvent; input: BuddyInput },
  guards: {
    remarkDue: ({ context }) =>
      context.chattiness !== 'off' && !isNight(context.hour) && context.now() >= context.nextRemarkAt,
    strollDue: ({ context }) => context.roaming && !isNight(context.hour) && context.now() >= context.nextStrollAt,
    phaseChanged: ({ context, event }) => event.type === 'CHAT_PHASE' && event.phase !== context.chatPhase,
    hearing: ({ context }) => context.chatPhase === 'hearing',
    thinking: ({ context }) => context.chatPhase === 'thinking',
    speaking: ({ context }) => context.chatPhase === 'speaking'
  },
  delays: {
    // A plain idle stretch before he does something small. Longer at night.
    idleTick: ({ context }) =>
      isNight(context.hour) ? between(context.random, 40 * SECOND, 80 * SECOND) : between(context.random, 12 * SECOND, 25 * SECOND),
    remarkShown: REMARK_MS,
    // Longest one-shot clip is ~13s. If CLIP_DONE never comes (a clip missing
    // from the model, a renderer hiccup), move on rather than freeze.
    clipTimeout: CLIP_TIMEOUT_MS
  },
  actions: {
    applySettings: assign(({ context, event }) => {
      if (event.type !== 'SETTINGS') return {}
      const chattinessChanged = event.chattiness !== context.chattiness
      return {
        roaming: event.roaming,
        chattiness: event.chattiness,
        hour: event.hour,
        weather: event.weather,
        // A newly switched-on chattiness starts its own clock rather than
        // firing at once because the old "never" was long overdue.
        nextRemarkAt: chattinessChanged ? context.now() + remarkGap(event.chattiness, context.random) : context.nextRemarkAt
      }
    }),
    setPosition: assign({ position: ({ context, event }) => (event.type === 'ARRIVED' ? event.at : context.position) }),
    setPhase: assign({ chatPhase: ({ context, event }) => (event.type === 'CHAT_PHASE' ? event.phase : context.chatPhase) }),
    clearBubble: assign({ bubble: null })
  }
}).createMachine({
  id: 'buddy',
  context: ({ input }) => {
    const random = input.random ?? Math.random
    const now = input.now ?? Date.now
    const position = input.position ?? CHAT_SPOT
    return {
      random,
      now,
      roaming: input.roaming,
      chattiness: input.chattiness,
      hour: input.hour,
      weather: input.weather ?? null,
      position,
      target: position,
      chatPhase: 'idle',
      bubble: null,
      recentRemarks: [],
      nextStrollAt: now() + strollGap(random),
      nextRemarkAt: now() + remarkGap(input.chattiness, random)
    }
  },
  initial: 'greeting',
  on: {
    SETTINGS: { actions: 'applySettings' },
    ARRIVED: { actions: 'setPosition' },
    CHAT_PHASE: { actions: 'setPhase' },
    CHAT_OPEN: { target: '.chat' }
  },
  states: {
    greeting: {
      entry: assign({ bubble: ({ context }) => greetingFor(context.hour, context.random) }),
      exit: 'clearBubble',
      on: { CLIP_DONE: 'resting' },
      after: { clipTimeout: 'resting' }
    },

    resting: {
      after: { idleTick: 'deciding' }
    },

    deciding: {
      always: [
        { guard: 'remarkDue', target: 'remarking' },
        { guard: 'strollDue', target: 'strolling' },
        { target: 'fidgeting' }
      ]
    },

    fidgeting: {
      on: { CLIP_DONE: 'resting' },
      after: { clipTimeout: 'resting' }
    },

    strolling: {
      entry: assign({ target: ({ context }) => pickStrollTarget(context.position, context.random) }),
      on: {
        ARRIVED: {
          target: 'resting',
          actions: ['setPosition', assign({ nextStrollAt: ({ context }) => context.now() + strollGap(context.random) })]
        }
      }
    },

    remarking: {
      entry: assign(({ context }) => {
        const line = pickRemark({
          hour: context.hour,
          weather: context.weather,
          recent: context.recentRemarks,
          random: context.random
        })
        return {
          bubble: line,
          recentRemarks: [...context.recentRemarks, line].slice(-4),
          nextRemarkAt: context.now() + remarkGap(context.chattiness, context.random)
        }
      }),
      exit: 'clearBubble',
      after: { remarkShown: 'resting' }
    },

    chat: {
      entry: [assign({ target: CHAT_SPOT, bubble: null })],
      initial: 'hello',
      on: {
        // Already chatting: another open is a no-op, not a restart.
        CHAT_OPEN: {},
        CHAT_PHASE: { guard: 'phaseChanged', actions: 'setPhase', target: '.routing' },
        PET: '.petted',
        CHAT_CLOSE: {
          target: 'farewell',
          actions: assign({
            chatPhase: 'idle',
            // Don't pipe up again right after a conversation.
            nextRemarkAt: ({ context }) => Math.max(context.nextRemarkAt, context.now() + remarkGap(context.chattiness, context.random))
          })
        }
      },
      states: {
        hello: { on: { CLIP_DONE: 'routing' }, after: { clipTimeout: 'routing' } },
        routing: {
          always: [
            { guard: 'hearing', target: 'hearing' },
            { guard: 'thinking', target: 'thinking' },
            { guard: 'speaking', target: 'talking' },
            { target: 'attending' }
          ]
        },
        attending: {},
        hearing: {},
        thinking: {},
        talking: {},
        petted: { on: { CLIP_DONE: 'routing' }, after: { clipTimeout: 'routing' } }
      }
    },

    farewell: {
      entry: assign({ bubble: ({ context }) => farewellLine(context.random) }),
      exit: 'clearBubble',
      on: { CLIP_DONE: 'resting' },
      after: { clipTimeout: 'resting' }
    }
  }
})

export type BuddyActivity =
  | 'greeting'
  | 'resting'
  | 'fidgeting'
  | 'strolling'
  | 'remarking'
  | 'farewell'
  | 'chat.hello'
  | 'chat.attending'
  | 'chat.hearing'
  | 'chat.thinking'
  | 'chat.talking'
  | 'chat.petted'

/** Flattens the snapshot's state value ("deciding"/"routing" are instantaneous and never observed). */
export function activityOf(value: unknown): BuddyActivity {
  if (typeof value === 'string') return value as BuddyActivity
  if (typeof value === 'object' && value !== null && 'chat' in value) {
    return `chat.${(value as { chat: string }).chat}` as BuddyActivity
  }
  return 'resting'
}
