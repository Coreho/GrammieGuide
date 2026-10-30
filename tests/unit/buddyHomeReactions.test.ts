import { describe, expect, it } from 'vitest'
import { createActor, SimulatedClock, type Actor } from 'xstate'
import {
  isMorning,
  MORNING_CLIP,
  reactionFor,
  REACTION_GAP_MS
} from '../../src/shared/buddy/homeReactions'
import {
  activityOf,
  buddyMachine,
  CLIP_TIMEOUT_MS,
  type BuddyActivity,
  type BuddyContext,
  type BuddyInput
} from '../../src/shared/buddy/buddyMachine'
import type { ClipName } from '../../src/shared/buddy/commands'
import { pickClip } from '../../src/renderer/launcher/src/buddy/clips'

const MIN = 60_000

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
      motion: 'roam',
      chattiness: 'off',
      hour: 15,
      random: () => 0.5,
      now: () => clock.now(),
      ...input
    }
  })
  actor.start()
  // Past the greeting, resting.
  actor.send({ type: 'CLIP_DONE' })
  return {
    actor,
    clock,
    activity: () => activityOf(actor.getSnapshot().value),
    ctx: () => actor.getSnapshot().context
  }
}

describe('home reactions', () => {
  it('welcomes her back from a view, and is warm after her pictures', () => {
    expect(reactionFor('builtinClosed')).toBe('wave')
    expect(reactionFor('photosClosed')).toBe('heart')
  })

  it('plays a reaction while he is idle, then settles', () => {
    const { actor, activity, ctx } = start()
    actor.send({ type: 'REACT', clip: 'heart' })
    expect(activity()).toBe('reacting')
    expect(ctx().forcedClip).toBe('heart')
    actor.send({ type: 'CLIP_DONE' })
    expect(activity()).toBe('resting')
    expect(ctx().forcedClip).toBeNull()
  })

  it('rate limits quick back-and-forth', () => {
    const { actor, activity, clock } = start()
    actor.send({ type: 'REACT', clip: 'wave' })
    actor.send({ type: 'CLIP_DONE' })
    actor.send({ type: 'REACT', clip: 'wave' })
    expect(activity()).toBe('resting')
    clock.increment(REACTION_GAP_MS)
    actor.send({ type: 'REACT', clip: 'wave' })
    expect(activity()).toBe('reacting')
  })

  it('never interrupts chat, a caregiver command or a walk', () => {
    const { actor, activity } = start()
    actor.send({ type: 'CHAT_OPEN', at: 0.5 })
    actor.send({ type: 'REACT', clip: 'wave' })
    expect(activity()).toBe('chat.hello')
    actor.send({ type: 'CHAT_CLOSE' })
    actor.send({ type: 'REACT', clip: 'wave' })
    expect(activity()).toBe('farewell')
    actor.send({ type: 'COMMAND', clip: 'bow' })
    actor.send({ type: 'REACT', clip: 'wave' })
    expect(activity()).toBe('commanded')
    actor.send({ type: 'COMMAND', walk: true })
    actor.send({ type: 'REACT', clip: 'wave' })
    expect(activity()).toBe('strolling')
  })

  it('never freezes on a reaction clip', () => {
    const { actor, activity, clock } = start()
    actor.send({ type: 'REACT', clip: 'wave' })
    clock.increment(CLIP_TIMEOUT_MS + 1)
    expect(activity()).toBe('resting')
  })
})

describe('morning stretch', () => {
  it('counts six to noon as morning', () => {
    expect([5, 6, 11, 12].map(isMorning)).toEqual([false, true, true, false])
  })

  it('stretches once at his first idle moment on a morning start', () => {
    const { activity, ctx, clock, actor } = start({ hour: 8 })
    clock.increment(30_000)
    expect(activity()).toBe('reacting')
    expect(ctx().forcedClip).toBe(MORNING_CLIP)
    actor.send({ type: 'CLIP_DONE' })
    expect(ctx().morningStretch).toBe(false)
    clock.increment(30_000)
    expect(ctx().forcedClip).not.toBe(MORNING_CLIP)
  })

  it('does not stretch on an afternoon start, but does when the next night ends', () => {
    const { actor, ctx, clock, activity } = start({ hour: 15 })
    expect(ctx().morningStretch).toBe(false)
    actor.send({ type: 'SETTINGS', motion: 'roam', chattiness: 'off', hour: 23, weather: null })
    expect(ctx().morningStretch).toBe(false)
    actor.send({ type: 'SETTINGS', motion: 'roam', chattiness: 'off', hour: 6, weather: null })
    expect(ctx().morningStretch).toBe(true)
    clock.increment(2 * MIN)
    expect(activity() === 'reacting' || ctx().morningStretch === false).toBe(true)
  })

  it('skips the stretch in reduced motion', () => {
    const { ctx, clock, activity } = start({ hour: 8, motion: 'reduced' })
    clock.increment(30_000)
    expect(activity()).toBe('resting')
    expect(ctx().morningStretch).toBe(false)
  })
})

describe('fidgets with music', () => {
  it('sway and dance along while music plays, but stay quiet at night', () => {
    const picks = (opts: { music?: boolean; night?: boolean }): Set<ClipName> =>
      new Set(
        Array.from({ length: 50 }, (_, i) =>
          pickClip('fidgeting', { random: () => i / 50, ...opts })
        )
      )
    expect(picks({ music: true })).toEqual(
      new Set(['sway', 'groove', 'dance', 'funny_dance', 'idle_soft'])
    )
    expect(picks({ music: true, night: true })).toEqual(
      new Set(['idle_soft', 'doze', 'look_around'])
    )
    expect(picks({})).toContain('stretch')
  })
})
