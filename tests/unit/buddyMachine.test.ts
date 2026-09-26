import { describe, it, expect } from 'vitest'
import { createActor, SimulatedClock, type Actor } from 'xstate'
import {
  buddyMachine,
  activityOf,
  type BuddyActivity,
  type BuddyContext,
  pickStrollTarget,
  remarkGap,
  CHAT_SPOT,
  FLOOR_MIN,
  FLOOR_MAX,
  REMARK_MS,
  CLIP_TIMEOUT_MS,
  type BuddyInput
} from '../../src/shared/buddy/buddyMachine'
import { pickRemark, timeOfDay, greetingFor } from '../../src/shared/buddy/remarks'

/** Deterministic "random" that walks a fixed sequence. */
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

type Harness = {
  actor: Actor<typeof buddyMachine>
  clock: SimulatedClock
  activity: () => BuddyActivity
  ctx: () => BuddyContext
}

function start(input: Partial<BuddyInput> = {}): Harness {
  const clock = new SimulatedClock()
  const actor = createActor(buddyMachine, {
    clock,
    input: {
      roaming: true,
      chattiness: 'off',
      hour: 10,
      random: seq(0.5),
      now: () => clock.now(),
      ...input
    }
  })
  actor.start()
  const activity = (): BuddyActivity => activityOf(actor.getSnapshot().value)
  const ctx = (): BuddyContext => actor.getSnapshot().context
  return { actor, clock, activity, ctx }
}

const MIN = 60_000

describe('buddy machine', () => {
  it('greets with a time-of-day bubble, then settles into resting', () => {
    const { actor, activity, ctx } = start({ hour: 8 })
    expect(activity()).toBe('greeting')
    expect(ctx().bubble).toMatch(/good morning/i)
    actor.send({ type: 'CLIP_DONE' })
    expect(activity()).toBe('resting')
    expect(ctx().bubble).toBeNull()
  })

  it('fidgets after an idle stretch and goes back to resting when the clip ends', () => {
    const { actor, clock, activity } = start()
    actor.send({ type: 'CLIP_DONE' })
    clock.increment(11_000)
    expect(activity()).toBe('resting')
    clock.increment(15_000)
    expect(activity()).toBe('fidgeting')
    actor.send({ type: 'CLIP_DONE' })
    expect(activity()).toBe('resting')
  })

  it('strolls once a stroll is due, and rests where he arrived', () => {
    const { actor, clock, activity, ctx } = start({ position: 0.5, random: seq(0.9, 0.5) })
    actor.send({ type: 'CLIP_DONE' })
    // Each idle tick is <= 25s; strolls are due within 75s.
    for (let i = 0; i < 6 && activity() !== 'strolling'; i++) {
      clock.increment(26_000)
      if (activity() === 'fidgeting') actor.send({ type: 'CLIP_DONE' })
    }
    expect(activity()).toBe('strolling')
    const target = ctx().target
    expect(Math.abs(target - 0.5)).toBeGreaterThanOrEqual(0.18)
    actor.send({ type: 'ARRIVED', at: target })
    expect(activity()).toBe('resting')
    expect(ctx().position).toBe(target)
  })

  it('never strolls when roaming is off', () => {
    const { actor, clock, activity } = start({ roaming: false })
    actor.send({ type: 'CLIP_DONE' })
    for (let i = 0; i < 40; i++) {
      clock.increment(26_000)
      expect(activity()).not.toBe('strolling')
      if (activity() === 'fidgeting') actor.send({ type: 'CLIP_DONE' })
    }
  })

  it('stays put and quiet at night', () => {
    const { actor, clock, activity } = start({ hour: 23, chattiness: 'normal' })
    actor.send({ type: 'CLIP_DONE' })
    for (let i = 0; i < 40; i++) {
      clock.increment(30_000)
      expect(['resting', 'fidgeting']).toContain(activity())
      if (activity() === 'fidgeting') actor.send({ type: 'CLIP_DONE' })
    }
  })

  it('makes no unprompted remarks while chattiness is off', () => {
    const { actor, clock, activity } = start({ roaming: false })
    actor.send({ type: 'CLIP_DONE' })
    for (let i = 0; i < 60; i++) {
      clock.increment(26_000)
      expect(activity()).not.toBe('remarking')
      if (activity() === 'fidgeting') actor.send({ type: 'CLIP_DONE' })
    }
  })

  it('remarks when chattiness is on, shows the bubble for a while, then clears it', () => {
    const { actor, clock, activity, ctx } = start({ roaming: false, chattiness: 'normal', random: seq(0.1) })
    actor.send({ type: 'CLIP_DONE' })
    let seen = false
    for (let i = 0; i < 20 && !seen; i++) {
      clock.increment(26_000)
      if (activity() === 'fidgeting') actor.send({ type: 'CLIP_DONE' })
      seen = activity() === 'remarking'
    }
    expect(seen).toBe(true)
    expect(ctx().bubble).toBeTruthy()
    clock.increment(REMARK_MS + 10)
    expect(activity()).toBe('resting')
    expect(ctx().bubble).toBeNull()
  })

  it('turning chattiness on starts a fresh wait instead of remarking at once', () => {
    const { actor, clock, activity } = start({ roaming: false })
    actor.send({ type: 'CLIP_DONE' })
    clock.increment(10 * MIN)
    if (activity() === 'fidgeting') actor.send({ type: 'CLIP_DONE' })
    actor.send({ type: 'SETTINGS', roaming: false, chattiness: 'normal', hour: 10, weather: null })
    clock.increment(26_000)
    expect(activity()).not.toBe('remarking')
  })

  describe('chatting', () => {
    function inChat(): Harness {
      const s = start()
      s.actor.send({ type: 'CLIP_DONE' })
      s.actor.send({ type: 'CHAT_OPEN' })
      return s
    }

    it('walks to the chat spot and waves hello', () => {
      const { activity, ctx } = inChat()
      expect(activity()).toBe('chat.hello')
      expect(ctx().target).toBe(CHAT_SPOT)
    })

    it('follows the panel: hearing, thinking, talking, then attending again', () => {
      const { actor, activity } = inChat()
      actor.send({ type: 'CLIP_DONE' })
      expect(activity()).toBe('chat.attending')
      actor.send({ type: 'CHAT_PHASE', phase: 'hearing' })
      expect(activity()).toBe('chat.hearing')
      actor.send({ type: 'CHAT_PHASE', phase: 'thinking' })
      expect(activity()).toBe('chat.thinking')
      actor.send({ type: 'CHAT_PHASE', phase: 'speaking' })
      expect(activity()).toBe('chat.talking')
      actor.send({ type: 'CHAT_PHASE', phase: 'idle' })
      expect(activity()).toBe('chat.attending')
    })

    it('a repeated phase does not restart what he is doing', () => {
      const { actor, activity } = inChat()
      actor.send({ type: 'CLIP_DONE' })
      actor.send({ type: 'CHAT_PHASE', phase: 'speaking' })
      actor.send({ type: 'PET' })
      expect(activity()).toBe('chat.petted')
      actor.send({ type: 'CHAT_PHASE', phase: 'speaking' })
      expect(activity()).toBe('chat.petted')
      actor.send({ type: 'CLIP_DONE' })
      expect(activity()).toBe('chat.talking')
    })

    it('a phase change during hello takes over right away', () => {
      const { actor, activity } = inChat()
      actor.send({ type: 'CHAT_PHASE', phase: 'thinking' })
      expect(activity()).toBe('chat.thinking')
    })

    it('does no idle business while chatting, however long it lasts', () => {
      const { actor, clock, activity } = inChat()
      actor.send({ type: 'CLIP_DONE' })
      clock.increment(30 * MIN)
      expect(activity()).toBe('chat.attending')
    })

    it('says goodbye when the panel closes, then rests at the chat spot', () => {
      const { actor, activity, ctx } = inChat()
      actor.send({ type: 'CLIP_DONE' })
      actor.send({ type: 'CHAT_CLOSE' })
      expect(activity()).toBe('farewell')
      expect(ctx().bubble).toBeTruthy()
      actor.send({ type: 'CLIP_DONE' })
      expect(activity()).toBe('resting')
      expect(ctx().target).toBe(CHAT_SPOT)
    })

    it('another CHAT_OPEN mid-chat is ignored', () => {
      const { actor, activity } = inChat()
      actor.send({ type: 'CLIP_DONE' })
      actor.send({ type: 'CHAT_PHASE', phase: 'thinking' })
      actor.send({ type: 'CHAT_OPEN' })
      expect(activity()).toBe('chat.thinking')
    })
  })
})

describe('pickStrollTarget', () => {
  it('stays on the floor and goes somewhere meaningfully different', () => {
    for (let i = 0; i < 200; i++) {
      const from = FLOOR_MIN + Math.random() * (FLOOR_MAX - FLOOR_MIN)
      const to = pickStrollTarget(from, Math.random)
      expect(to).toBeGreaterThanOrEqual(FLOOR_MIN)
      expect(to).toBeLessThanOrEqual(FLOOR_MAX)
      expect(Math.abs(to - from)).toBeGreaterThanOrEqual(0.18)
    }
  })

  it('heads for the far end when chance keeps landing too close', () => {
    expect(pickStrollTarget(0.2, () => 0.2)).toBe(FLOOR_MAX)
    expect(pickStrollTarget(0.8, () => 0.8)).toBe(FLOOR_MIN)
  })
})

describe('remarks', () => {
  it('buckets hours into times of day', () => {
    expect([5, 11, 12, 16, 17, 20, 21, 4].map(timeOfDay)).toEqual([
      'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night'
    ])
  })

  it('greets for the time of day', () => {
    expect(greetingFor(14, () => 0)).toMatch(/afternoon/i)
  })

  it('does not repeat a recent line when there is another choice', () => {
    const first = pickRemark({ hour: 10, weather: null, recent: [], random: () => 0 })
    const second = pickRemark({ hour: 10, weather: null, recent: [first], random: () => 0 })
    expect(second).not.toBe(first)
  })

  it('can mention the weather when there is some', () => {
    const lines = new Set<string>()
    for (let r = 0; r < 1; r += 0.05) {
      lines.add(pickRemark({ hour: 14, weather: { category: 'rain', temp: 61.6, unit: 'F' }, recent: [], random: () => r }))
    }
    expect([...lines]).toContain("It's 62 degrees outside right now.")
    expect([...lines].some((l) => /rainy/.test(l))).toBe(true)
  })

  it('remark gaps follow chattiness', () => {
    expect(remarkGap('off', Math.random)).toBe(Infinity)
    expect(remarkGap('normal', () => 0)).toBe(2 * MIN)
    expect(remarkGap('low', () => 1)).toBe(10 * MIN)
  })
})

describe('stuck clips', () => {
  it('moves on from a one-shot that never reports back', () => {
    const clock = new SimulatedClock()
    const actor = createActor(buddyMachine, {
      clock,
      input: { roaming: false, chattiness: 'off', hour: 10, random: () => 0.5, now: () => clock.now() }
    })
    actor.start()
    expect(activityOf(actor.getSnapshot().value)).toBe('greeting')
    clock.increment(CLIP_TIMEOUT_MS + 1)
    expect(activityOf(actor.getSnapshot().value)).toBe('resting')
    actor.send({ type: 'CHAT_OPEN' })
    expect(activityOf(actor.getSnapshot().value)).toBe('chat.hello')
    clock.increment(CLIP_TIMEOUT_MS + 1)
    expect(activityOf(actor.getSnapshot().value)).toBe('chat.attending')
  })
})
