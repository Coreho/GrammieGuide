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
import type { BuddyChatTurn } from '../../src/shared/ipcContract'

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

  it('returns the friendly not-set-up line without calling the API when no key is set', async () => {
    const { client, create } = fakeClient(() => textResponse('unused'))
    const result = await buddyChat(greetingThenUser, { apiKey: undefined, model: 'claude-haiku-4-5', client, log })
    expect(result).toEqual({ ok: false, reason: 'no-key', reply: REPLIES.noKey })
    expect(create).not.toHaveBeenCalled()
  })

  it('sends the frozen system prompt and returns the model text', async () => {
    const { client, create } = fakeClient(() => textResponse('Hello there! How is your day going?'))
    const result = await buddyChat(greetingThenUser, { apiKey: 'k', model: 'claude-haiku-4-5', client, log })
    expect(result).toEqual({ ok: true, reply: 'Hello there! How is your day going?' })
    const params = create.mock.calls[0]![0]
    expect(params.system).toBe(BUDDY_SYSTEM_PROMPT)
    expect(params.model).toBe('claude-haiku-4-5')
    // Haiku 4.5 rejects `effort` - it must not be sent there.
    expect(params).not.toHaveProperty('output_config')
  })

  it('asks newer models for low effort', async () => {
    const { client, create } = fakeClient(() => textResponse('Hi!'))
    await buddyChat(greetingThenUser, { apiKey: 'k', model: 'claude-sonnet-5', client, log })
    expect(create.mock.calls[0]![0]).toMatchObject({ output_config: { effort: 'low' } })
  })

  it('turns a refusal into a gentle change of subject', async () => {
    const { client } = fakeClient(() => ({ content: [], stop_reason: 'refusal', stop_details: { category: null } }))
    const result = await buddyChat(greetingThenUser, { apiKey: 'k', model: 'claude-haiku-4-5', client, log })
    expect(result).toEqual({ ok: false, reason: 'declined', reply: REPLIES.declined })
  })

  it('never surfaces technical errors to her - logs them for the caregiver instead', async () => {
    const log = vi.fn()
    const { client } = fakeClient(() => {
      throw new Anthropic.APIConnectionError({ message: 'offline' })
    })
    const result = await buddyChat(greetingThenUser, { apiKey: 'k', model: 'claude-haiku-4-5', client, log })
    expect(result).toEqual({ ok: false, reason: 'unavailable', reply: REPLIES.unavailable })
    expect(log).toHaveBeenCalledWith('buddy-chat-error', expect.stringContaining('connection'))
  })

  it('does not call the API when the last turn is not from her', async () => {
    const { client, create } = fakeClient(() => textResponse('unused'))
    const result = await buddyChat([{ role: 'assistant', text: 'Hi!' }], {
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      client,
      log
    })
    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})
