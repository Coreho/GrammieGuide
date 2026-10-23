import { describe, expect, it, vi } from 'vitest'
import { buddyChat } from '../../src/main/services/ai/buddyChatService'
import { PersonalHistory, type PersonalFact } from '../../src/shared/buddy/personalFacts'
import type { PlanCompletion } from '../../src/main/services/chatgpt/transport'

describe('ChatGPT Buddy integration', () => {
  const base = {
    chatEnabled: true,
    apiKey: undefined,
    client: null,
    provider: 'chatgpt' as const,
    model: 'account-model',
    log: vi.fn()
  }
  it('uses sanitized full text history without an API key', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'Hello.', tools: [], refused: false })
    expect(
      await buddyChat(
        [
          { role: 'assistant', text: 'greeting' },
          { role: 'user', text: ' Hi ' }
        ],
        { ...base, generate }
      )
    ).toEqual({ ok: true, reply: 'Hello.' })
    expect(generate).toHaveBeenCalledWith([{ role: 'user', content: 'Hi' }])
  })
  it('resolves one validated action and discards model success claims', async () => {
    const resolveAction = vi
      .fn()
      .mockResolvedValue({ ok: false, reply: 'Your music is not available yet.' })
    const result = await buddyChat(
      [{ role: 'user', text: 'Could we listen to something relaxing?' }],
      {
        ...base,
        resolveAction,
        generate: async () => ({
          text: 'I started it!',
          refused: false,
          tools: [{ name: 'play_my_music', input: {} }]
        })
      }
    )
    expect(resolveAction).toHaveBeenCalledWith('playMusic')
    expect(result.reply).not.toContain('started')
  })
  it('discards a completed reply when the caregiver changes personal facts while it is pending', async () => {
    let release!: (value: PlanCompletion) => void
    let facts: PersonalFact[] = []
    const pending = buddyChat([{ role: 'user', text: 'Who is visiting today?' }], {
      ...base,
      personal: { facts: () => facts, history: new PersonalHistory() },
      generate: () =>
        new Promise((resolve) => {
          release = resolve
        })
    })
    facts = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        kind: 'family',
        text: 'Her daughter is named Jean.',
        cancelled: false
      }
    ]
    release({ text: 'Stale answer', tools: [], refused: false })
    expect((await pending).reply).not.toBe('Stale answer')
  })
  it('returns the calm failure reply without logging provider content', async () => {
    const log = vi.fn()
    const result = await buddyChat([{ role: 'user', text: 'Hello' }], {
      ...base,
      log,
      generate: async () => {
        throw Error('private content')
      }
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(log.mock.calls)).not.toContain('private content')
  })
})
