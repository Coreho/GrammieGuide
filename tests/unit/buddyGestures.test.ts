import { describe, expect, it, vi } from 'vitest'
import { createActor, SimulatedClock, type Actor } from 'xstate'
import {
  BUDDY_GESTURES,
  explicitGestureRequest,
  gestureFromTool,
  performGesture
} from '../../src/shared/buddy/gestures'
import { gestureForReply } from '../../src/shared/buddy/replyGesture'
import { BUDDY_CLIPS } from '../../src/shared/buddy/commands'
import {
  activityOf,
  buddyMachine,
  CLIP_TIMEOUT_MS,
  type BuddyActivity,
  type BuddyContext,
  type BuddyMotion
} from '../../src/shared/buddy/buddyMachine'
import { buddyChat } from '../../src/main/services/ai/buddyChatService'
import { BUDDY_ACTION_TOOLS } from '../../src/main/services/ai/buddyActions'
import type { BuddyChatTurn } from '../../src/shared/ipcContract'

function ask(text: string): BuddyChatTurn[] {
  return [
    { role: 'assistant', text: "Hi! It's nice to see you." },
    { role: 'user', text }
  ]
}

describe('explicit gesture requests', () => {
  it.each([
    ['dance', 'dance'],
    ['Dance!', 'dance'],
    ['Buddy, dance for me', 'dance'],
    ['Can you do a little dance?', 'dance'],
    ["Let's dance", 'dance'],
    ['show me your dance moves', 'dance'],
    ['Please wave to me', 'wave'],
    ['Hey buddy, wave hello', 'wave'],
    ['give me a big wave', 'wave'],
    ['Take a bow', 'bow'],
    ['would you jump up and down', 'jump'],
    ['do a happy hop', 'jump'],
    ['cheer', 'cheer'],
    ['Blow me a kiss', 'heart'],
    ['send me some love', 'heart'],
    ['have a stretch', null],
    ['stretch', 'stretch'],
    ['Show me a trick', 'trick'],
    ['do a magic trick, Buddy', 'trick'],
    ['Do something silly', 'trick'],
    ['dance again please', 'dance']
  ])('reads %j as %s', (text, gesture) => {
    expect(explicitGestureRequest(text)).toBe(gesture)
  })

  it.each([
    'I used to dance with my husband',
    'Do you like to dance?',
    'I want to dance',
    'The wave at the beach was huge',
    'show me your wave moves',
    'show me the news',
    'open my pictures',
    ''
  ])('leaves %j as conversation', (text) => {
    expect(explicitGestureRequest(text)).toBeNull()
  })
})

describe('performing a gesture', () => {
  it('plays a real clip with a fixed line that asks nothing', () => {
    for (const gesture of BUDDY_GESTURES) {
      for (const random of [() => 0, () => 0.99]) {
        const { clip, reply } = performGesture(gesture, 'roam', random)
        expect(BUDDY_CLIPS).toContain(clip)
        expect(reply).not.toContain('?')
      }
    }
  })

  it('keeps reduced motion to a calm wave or heart', () => {
    for (const gesture of BUDDY_GESTURES) {
      const { clip } = performGesture(gesture, 'reduced')
      expect(clip).toBe(gesture === 'heart' ? 'heart' : 'wave')
    }
  })

  it('accepts only its own tool with an allowed gesture', () => {
    expect(gestureFromTool('do_a_gesture', { gesture: 'dance' })).toBe('dance')
    expect(gestureFromTool('do_a_gesture', { gesture: 'backflip' })).toBeNull()
    expect(gestureFromTool('do_a_gesture', { gesture: 'dance', speed: 9 })).toBeNull()
    expect(gestureFromTool('go_home', { gesture: 'dance' })).toBeNull()
    const tool = BUDDY_ACTION_TOOLS.find((t) => t.name === 'do_a_gesture')!
    expect(tool.input_schema.required).toEqual(['gesture'])
  })
})

describe('gesture requests in chat', () => {
  it('answers an explicit request without the model, a connection or a tile search', async () => {
    const generate = vi.fn()
    const resolveAction = vi.fn()
    const log = vi.fn()
    const result = await buddyChat(ask('Show me a trick'), {
      chatEnabled: true,
      generate,
      resolveAction,
      log
    })
    expect(result).toMatchObject({ ok: true, reply: "Here's a little trick for you!" })
    expect(result.ok && result.gesture).toBeTruthy()
    expect(generate).not.toHaveBeenCalled()
    expect(resolveAction).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()

    const offline = await buddyChat(ask('dance'), { chatEnabled: true, log })
    expect(offline).toMatchObject({ ok: true, reply: "Here's a little dance for you!" })
    expect(['dance', 'groove', 'funny_dance']).toContain(offline.ok && offline.gesture)
  })

  it('respects the chat switch and reduced motion', async () => {
    const off = await buddyChat(ask('dance'), { chatEnabled: false, log: vi.fn() })
    expect(off).toMatchObject({ ok: false, reason: 'disabled' })
    const calm = await buddyChat(ask('dance'), {
      chatEnabled: true,
      motion: 'reduced',
      log: vi.fn()
    })
    expect(calm).toMatchObject({ ok: true, gesture: 'wave' })
  })

  it('plays a gesture the model asked for and drops its text', async () => {
    const result = await buddyChat(ask('Would you do something to cheer me up, dear?'), {
      chatEnabled: true,
      generate: async () => ({
        text: 'I did a backflip!',
        tools: [{ name: 'do_a_gesture', input: { gesture: 'cheer' } }],
        refused: false
      }),
      resolveAction: vi.fn(),
      log: vi.fn()
    })
    expect(result).toEqual({ ok: true, reply: 'Hooray! A big cheer for you!', gesture: 'cheer' })
  })

  it('refuses a gesture tool outside the allow-list', async () => {
    const result = await buddyChat(ask('Do a backflip'), {
      chatEnabled: true,
      generate: async () => ({
        text: '',
        tools: [{ name: 'do_a_gesture', input: { gesture: 'backflip' } }],
        refused: false
      }),
      resolveAction: vi.fn(),
      log: vi.fn()
    })
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
  })
})

describe('gesture for a spoken line', () => {
  it.each([
    ["Hi! It's nice to see you.", 'wave'],
    ['Thank you for telling me.', 'bow'],
    ['Happy birthday to your grandson!', 'cheer'],
    ['That sounds lovely.', 'heart'],
    ['Yes, that is right.', 'agree'],
    ['Hmm, let me think about that.', 'think'],
    ["I'm sorry you lost your keys. I'm here with you.", 'heart'],
    ["I'm sorry, that sounds sad. Congratulations can wait.", null],
    ['The kettle takes about three minutes.', null],
    ['', null]
  ])('opens %j with %s', (line, clip) => {
    expect(gestureForReply(line)).toBe(clip)
  })
})

type ChatHarness = {
  actor: Actor<typeof buddyMachine>
  clock: SimulatedClock
  activity: () => BuddyActivity
  ctx: () => BuddyContext
}

function chatActor(motion: BuddyMotion): ChatHarness {
  const clock = new SimulatedClock()
  const actor = createActor(buddyMachine, {
    clock,
    input: { motion, chattiness: 'off', hour: 10, random: () => 0.5, now: () => clock.now() }
  })
  actor.start()
  actor.send({ type: 'CHAT_OPEN', at: 0.5 })
  actor.send({ type: 'CLIP_DONE' })
  return {
    actor,
    clock,
    activity: () => activityOf(actor.getSnapshot().value),
    ctx: () => actor.getSnapshot().context
  }
}

describe('gestures in the machine', () => {
  it('opens a spoken line with its gesture, then carries on with the usual gestures', () => {
    const { actor, activity, ctx } = chatActor('roam')
    actor.send({ type: 'CHAT_PHASE', phase: 'speaking', gesture: 'heart' })
    expect(activity()).toBe('chat.talking')
    expect(ctx().openingClip).toBe('heart')
    // A suggestion, not a deliberate gesture: data-buddy-clip stays for those.
    expect(ctx().forcedClip).toBeNull()
    actor.send({ type: 'CLIP_DONE' })
    expect(activity()).toBe('chat.talking')
    expect(ctx().openingClip).toBeNull()
    actor.send({ type: 'CHAT_PHASE', phase: 'idle' })
    expect(activity()).toBe('chat.attending')
    // The next line without a cue starts plainly.
    actor.send({ type: 'CHAT_PHASE', phase: 'speaking' })
    expect(ctx().openingClip).toBeNull()
  })

  it('keeps reduced motion to its single talk gesture', () => {
    const { actor, activity, ctx } = chatActor('reduced')
    actor.send({ type: 'CHAT_PHASE', phase: 'speaking', gesture: 'cheer' })
    expect(activity()).toBe('chat.talking')
    expect(ctx().openingClip).toBeNull()
    actor.send({ type: 'CLIP_DONE' })
    expect(activity()).toBe('chat.attending')
  })

  it('performs a requested gesture through the reply, and replays it when asked again', () => {
    const { actor, activity, ctx } = chatActor('roam')
    actor.send({ type: 'GESTURE', clip: 'dance' })
    expect(activity()).toBe('chat.gesturing')
    expect(ctx().forcedClip).toBe('dance')
    const first = ctx().gestureSequence
    // His spoken reply must not interrupt the dance.
    actor.send({ type: 'CHAT_PHASE', phase: 'speaking' })
    actor.send({ type: 'CHAT_PHASE', phase: 'idle' })
    expect(activity()).toBe('chat.gesturing')
    actor.send({ type: 'GESTURE', clip: 'dance' })
    expect(ctx().gestureSequence).toBe(first + 1)
    actor.send({ type: 'CLIP_DONE' })
    expect(activity()).toBe('chat.attending')
    expect(ctx().forcedClip).toBeNull()
  })

  it('returns to talking if he is still speaking when the gesture ends, and never freezes', () => {
    const { actor, activity, clock } = chatActor('roam')
    actor.send({ type: 'GESTURE', clip: 'bow' })
    actor.send({ type: 'CHAT_PHASE', phase: 'speaking' })
    clock.increment(CLIP_TIMEOUT_MS + 1)
    expect(activity()).toBe('chat.talking')
  })

  it('ignores gesture requests outside chat', () => {
    const clock = new SimulatedClock()
    const actor = createActor(buddyMachine, {
      clock,
      input: { motion: 'roam', chattiness: 'off', hour: 10, now: () => clock.now() }
    })
    actor.start()
    actor.send({ type: 'CLIP_DONE' })
    actor.send({ type: 'GESTURE', clip: 'dance' })
    expect(activityOf(actor.getSnapshot().value)).toBe('resting')
  })
})
