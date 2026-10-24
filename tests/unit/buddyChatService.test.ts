import { describe, it, expect, vi } from 'vitest'
import {
  buddyChat,
  toApiMessages,
  REPLIES,
  MAX_TURNS,
  MAX_TURN_CHARS
} from '../../src/main/services/ai/buddyChatService'
import type { BuddyChatTurn } from '../../src/shared/ipcContract'
import { PersonalHistory, type PersonalFact } from '../../src/shared/buddy/personalFacts'

import type { BuddyMessage, BuddyCompletion } from '../../src/main/services/ai/buddyCompletion'
function fakeReply(
  impl: (messages: BuddyMessage[]) => BuddyCompletion | Promise<BuddyCompletion>
): { generate: ReturnType<typeof vi.fn<(messages: BuddyMessage[]) => Promise<BuddyCompletion>>> } {
  return { generate: vi.fn(async (messages: BuddyMessage[]) => impl(messages)) }
}
function textResponse(text: string): BuddyCompletion {
  return { text, tools: [], refused: false }
}

const greetingThenUser: BuddyChatTurn[] = [
  { role: 'assistant', text: 'Hi! Tap the box below and say something to me.' },
  { role: 'user', text: 'Hello Buddy' }
]

describe('toApiMessages', () => {
  it('drops the leading assistant greeting so history starts with a user turn', () => {
    expect(toApiMessages(greetingThenUser)).toEqual([{ role: 'user', content: 'Hello Buddy' }])
  })

  it('merges consecutive same-role turns and drops blanks', () => {
    const out = toApiMessages([
      { role: 'user', text: 'Hi' },
      { role: 'user', text: '   ' },
      { role: 'user', text: 'Are you there?' }
    ])
    expect(out).toEqual([{ role: 'user', content: 'Hi\n\nAre you there?' }])
  })

  it('caps turn count and per-turn length', () => {
    const many: BuddyChatTurn[] = Array.from({ length: MAX_TURNS + 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: 'x'.repeat(MAX_TURN_CHARS + 50)
    }))
    const out = toApiMessages(many)
    expect(out.length).toBeLessThanOrEqual(MAX_TURNS)
    for (const m of out) expect((m.content as string).length).toBe(MAX_TURN_CHARS)
  })
})

describe('buddyChat', () => {
  it.each(['deleted', 'cancelled', 'expired'])(
    'discards a pending reply when a plan is %s while Buddy is thinking',
    async (change) => {
      let now = new Date('2026-10-20T12:00:00Z')
      let finish!: (value: BuddyCompletion) => void
      const request = fakeReply(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      let facts: PersonalFact[] = [
        {
          id: '00000000-0000-4000-8000-000000000001',
          kind: 'plan',
          text: 'Sarah visits for tea',
          date: '2026-10-20',
          cancelled: false
        }
      ]
      const pending = buddyChat([{ role: 'user', text: 'Is Sarah visiting?' }], {
        chatEnabled: true,

        generate: request.generate,
        log: vi.fn(),
        personal: {
          facts: () => facts,
          history: new PersonalHistory(),
          now: () => now,
          timeZone: 'America/New_York'
        }
      })
      if (change === 'deleted') facts = []
      if (change === 'cancelled') facts = facts.map((fact) => ({ ...fact, cancelled: true }))
      if (change === 'expired') now = new Date('2026-10-21T04:00:00Z')
      finish(textResponse('Sarah is visiting for tea today.'))
      expect(await pending).toEqual({
        ok: true,
        reply: 'I am not sure about that. Your family can help.'
      })
    }
  )
  it('adds current approved facts to each conversation request, keeping the system frozen and logs private', async () => {
    const request = fakeReply(() => textResponse('I am not sure. You could ask your family.'))
    const history = new PersonalHistory()
    let facts: PersonalFact[] = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        kind: 'plan',
        text: 'Sarah visits for tea',
        date: '2026-10-20',
        cancelled: false
      }
    ]
    const privateLog = vi.fn()
    const opts = {
      chatEnabled: true,

      generate: request.generate,
      log: privateLog,
      personal: {
        facts: () => facts,
        history,
        now: () => new Date('2026-10-20T16:00:00Z'),
        timeZone: 'America/New_York'
      }
    }
    const turns: BuddyChatTurn[] = [{ role: 'user', text: 'Who is visiting?' }]
    await buddyChat(turns, opts)
    const first = request.generate.mock.calls[0]![0]

    expect(JSON.stringify(first)).toContain('Sarah visits for tea')
    expect(JSON.stringify(first)).toContain('2026-10-20 in America/New_York')
    facts = []
    await buddyChat(
      [
        ...turns,
        { role: 'assistant', text: 'Sarah visits for tea' },
        { role: 'user', text: 'What time?' }
      ],
      opts
    )
    const second = request.generate.mock.calls[1]![0]

    expect(JSON.stringify(second)).not.toContain('Sarah')
    expect(JSON.stringify(second)).toContain('say warmly that you do not know')
    expect(privateLog).not.toHaveBeenCalled()
  })

  it('returns the setup reply without a connected generator', async () => {
    expect(await buddyChat(greetingThenUser, { chatEnabled: true, log: vi.fn() })).toEqual({
      ok: false,
      reason: 'not-connected',
      reply: REPLIES.notConnected
    })
  })
  it('does not call a connected generator when chat is disabled or history is invalid', async () => {
    const generate = vi.fn()
    expect(
      await buddyChat(greetingThenUser, { chatEnabled: false, generate, log: vi.fn() })
    ).toMatchObject({ reason: 'disabled' })
    expect(
      await buddyChat([{ role: 'assistant', text: 'Hi' }], {
        chatEnabled: true,
        generate,
        log: vi.fn()
      })
    ).toMatchObject({ reason: 'unavailable' })
    expect(generate).not.toHaveBeenCalled()
  })
  it.each([
    { text: '', tools: [], refused: false },
    { text: '', tools: [], refused: true }
  ])('keeps empty or refused completions gentle', async (completion) => {
    const result = await buddyChat(greetingThenUser, {
      chatEnabled: true,
      generate: async () => completion,
      log: vi.fn()
    })
    expect(result).toMatchObject({ ok: false, reply: expect.any(String) })
  })
  it.each([
    [{ name: 'open_url', input: {} }],
    [{ name: 'go_home', input: { url: 'https://evil.test' } }],
    [
      { name: 'go_home', input: {} },
      { name: 'play_my_music', input: {} }
    ]
  ])('rejects invented or multiple model actions', async (...tools) => {
    const resolveAction = vi.fn()
    const result = await buddyChat(greetingThenUser, {
      chatEnabled: true,
      generate: async () => ({ text: 'Done!', tools, refused: false }),
      resolveAction,
      log: vi.fn()
    })
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(resolveAction).not.toHaveBeenCalled()
  })
})
