import { describe, it, expect, vi } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import {
  buddyChat,
  toApiMessages,
  REPLIES,
  MAX_TURNS,
  MAX_TURN_CHARS
} from '../../src/main/services/ai/buddyChatService'
import { BUDDY_SYSTEM_PROMPT } from '../../src/main/services/ai/buddyPrompt'
import { defaultConfig } from '../../src/shared/configSchema'
import type { BuddyChatTurn } from '../../src/shared/ipcContract'
import { PersonalHistory, type PersonalFact } from '../../src/shared/buddy/personalFacts'

type CreateFn = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<unknown>

function fakeClient(impl: (params: Anthropic.MessageCreateParamsNonStreaming) => unknown): {
  client: Pick<Anthropic, 'messages'>
  create: ReturnType<typeof vi.fn<CreateFn>>
} {
  const create = vi.fn<CreateFn>(async (params) => impl(params))
  return { client: { messages: { create } } as unknown as Pick<Anthropic, 'messages'>, create }
}

function textResponse(text: string, stop_reason = 'end_turn'): unknown {
  return { content: [{ type: 'text', text }], stop_reason, stop_details: null }
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
  const log = vi.fn()
  it.each(['deleted', 'cancelled', 'expired'])(
    'discards a pending reply when a plan is %s while Buddy is thinking',
    async (change) => {
      let now = new Date('2026-10-20T12:00:00Z')
      let finish!: (value: unknown) => void
      const request = fakeClient(
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
        apiKey: 'test',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        client: request.client,
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
    const request = fakeClient(() => textResponse('I am not sure. You could ask your family.'))
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
      apiKey: 'test',
      provider: 'anthropic' as const,
      model: 'claude-sonnet-5-5',
      client: request.client,
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
    const first = request.create.mock.calls[0]![0]
    expect(first.system).toBe(BUDDY_SYSTEM_PROMPT)
    expect(JSON.stringify(first.messages)).toContain('Sarah visits for tea')
    expect(JSON.stringify(first.messages)).toContain('2026-10-20 in America/New_York')
    facts = []
    await buddyChat(
      [
        ...turns,
        { role: 'assistant', text: 'Sarah visits for tea' },
        { role: 'user', text: 'What time?' }
      ],
      opts
    )
    const second = request.create.mock.calls[1]![0]
    expect(second.system).toBe(BUDDY_SYSTEM_PROMPT)
    expect(JSON.stringify(second.messages)).not.toContain('Sarah')
    expect(JSON.stringify(second.messages)).toContain('say warmly that you do not know')
    expect(privateLog).not.toHaveBeenCalled()
  })

  it('resolves a direct request without a key or API call and returns a plan rather than a success claim', async () => {
    const resolveAction = vi.fn().mockResolvedValue({ ok: true, plan: { action: 'goHome' } })
    const result = await buddyChat([{ role: 'user', text: 'Please go home.' }], {
      chatEnabled: true,
      apiKey: undefined,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      client: null,
      log,
      resolveAction
    })
    expect(resolveAction).toHaveBeenCalledExactlyOnceWith('goHome')
    expect(result).toEqual({ ok: true, reply: '', action: { action: 'goHome' } })
  })
  it('uses only the fixed tools and discards premature model success text when returning a validated plan', async () => {
    const { client, create } = fakeClient(() => ({
      content: [
        { type: 'text', text: 'Your music is playing already.' },
        { type: 'tool_use', name: 'play_my_music', input: {} }
      ],
      stop_reason: 'tool_use'
    }))
    const resolveAction = vi
      .fn()
      .mockResolvedValue({ ok: true, plan: { action: 'playMusic', playlistId: 'saved' } })
    expect(
      await buddyChat([{ role: 'user', text: 'I feel like hearing something familiar.' }], {
        chatEnabled: true,
        apiKey: 'k',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        client,
        log,
        resolveAction
      })
    ).toEqual({ ok: true, reply: '', action: { action: 'playMusic', playlistId: 'saved' } })
    expect(create.mock.calls[0]![0].tools?.map((tool) => tool.name)).toEqual([
      'play_my_music',
      'show_my_pictures',
      'go_home',
      'open_saved_tile'
    ])
    expect(create.mock.calls[0]![0].system).toBe(BUDDY_SYSTEM_PROMPT)
  })
  it.each([
    [{ type: 'tool_use', name: 'open_url', input: {} }],
    [{ type: 'tool_use', name: 'go_home', input: { url: 'https://evil.test' } }],
    [
      { type: 'tool_use', name: 'go_home', input: {} },
      { type: 'tool_use', name: 'play_my_music', input: {} }
    ]
  ])(
    'rejects invented or multiple model actions without executing or confirming them',
    async (...blocks) => {
      const { client } = fakeClient(() => ({ content: blocks, stop_reason: 'tool_use' }))
      const resolveAction = vi.fn()
      expect(
        await buddyChat(greetingThenUser, {
          chatEnabled: true,
          apiKey: 'k',
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          client,
          log,
          resolveAction
        })
      ).toMatchObject({ ok: false, reason: 'unavailable' })
      expect(resolveAction).not.toHaveBeenCalled()
    }
  )

  it.each(['k', undefined])(
    'refuses disabled chat with key %s without calling Anthropic',
    async (apiKey) => {
      const { client, create } = fakeClient(() => textResponse('unused'))
      const result = await buddyChat(greetingThenUser, {
        chatEnabled: false,
        apiKey,
        model: 'claude-sonnet-5-5',
        client,
        log
      })
      expect(result).toMatchObject({ ok: false, reason: 'disabled', reply: expect.any(String) })
      expect(create).not.toHaveBeenCalled()
    }
  )

  it('returns the friendly not-set-up line without calling the API when no key is set', async () => {
    const { client, create } = fakeClient(() => textResponse('unused'))
    const result = await buddyChat(greetingThenUser, {
      chatEnabled: true,
      apiKey: undefined,
      model: 'claude-haiku-4-5',
      client,
      log
    })
    expect(result).toEqual({ ok: false, reason: 'no-key', reply: REPLIES.noKey })
    expect(create).not.toHaveBeenCalled()
  })

  it('sends the frozen system prompt and returns the model text', async () => {
    const { client, create } = fakeClient(() => textResponse('Hello there! How is your day going?'))
    const result = await buddyChat(greetingThenUser, {
      chatEnabled: true,
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      client,
      log
    })
    expect(result).toEqual({ ok: true, reply: 'Hello there! How is your day going?' })
    const params = create.mock.calls[0]![0]
    expect(params.system).toBe(BUDDY_SYSTEM_PROMPT)
    expect(params.model).toBe('claude-haiku-4-5')
    // Haiku 4.5 rejects `effort` - it must not be sent there.
    expect(params).not.toHaveProperty('output_config')
  })

  it('asks newer models for low effort', async () => {
    const { client, create } = fakeClient(() => textResponse('Hi!'))
    await buddyChat(greetingThenUser, {
      chatEnabled: true,
      apiKey: 'k',
      model: 'claude-sonnet-5',
      client,
      log
    })
    expect(create.mock.calls[0]![0]).toMatchObject({ output_config: { effort: 'low' } })
  })

  it('defaults new setups to Sonnet 5.5, asked for low effort', async () => {
    const { client, create } = fakeClient(() => textResponse('Hi!'))
    const model = defaultConfig().buddy.model
    expect(model).toBe('claude-sonnet-5-5')
    await buddyChat(greetingThenUser, { chatEnabled: true, apiKey: 'k', model, client, log })
    expect(create.mock.calls[0]![0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      output_config: { effort: 'low' }
    })
  })

  it('turns a refusal into a gentle change of subject', async () => {
    const { client } = fakeClient(() => ({
      content: [],
      stop_reason: 'refusal',
      stop_details: { category: null }
    }))
    const result = await buddyChat(greetingThenUser, {
      chatEnabled: true,
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      client,
      log
    })
    expect(result).toEqual({ ok: false, reason: 'declined', reply: REPLIES.declined })
  })

  it('never surfaces technical errors to her - logs them for the caregiver instead', async () => {
    const log = vi.fn()
    const { client } = fakeClient(() => {
      throw new Anthropic.APIConnectionError({ message: 'offline' })
    })
    const result = await buddyChat(greetingThenUser, {
      chatEnabled: true,
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      client,
      log
    })
    expect(result).toEqual({ ok: false, reason: 'unavailable', reply: REPLIES.unavailable })
    expect(log).toHaveBeenCalledWith('buddy-chat-error', expect.stringContaining('connection'))
  })

  it('does not call the API when the last turn is not from her', async () => {
    const { client, create } = fakeClient(() => textResponse('unused'))
    const result = await buddyChat([{ role: 'assistant', text: 'Hi!' }], {
      chatEnabled: true,
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      client,
      log
    })
    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('names the provider that could not be reached, so an OpenRouter outage is not blamed on Anthropic', async () => {
    for (const [provider, name] of [
      ['anthropic', 'Anthropic'],
      ['openrouter', 'OpenRouter']
    ] as const) {
      const log = vi.fn()
      const { client } = fakeClient(() => {
        throw new Anthropic.APIConnectionError({ message: 'offline' })
      })
      await buddyChat(greetingThenUser, {
        chatEnabled: true,
        apiKey: 'k',
        provider,
        model: 'claude-sonnet-5-5',
        client,
        log
      })
      expect(log).toHaveBeenCalledWith('buddy-chat-error', `no connection to the ${name} API`)
    }
  })
})
