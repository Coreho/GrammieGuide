import { describe, expect, it, vi } from 'vitest'
import {
  directContactGuidance,
  contactGuidanceContext
} from '../../src/shared/buddy/contactGuidance'
import { buddyChat } from '../../src/main/services/ai/buddyChatService'

describe('Buddy callback guidance', () => {
  it('offers the real button without claiming a notification or sending from chat, even without an API key', async () => {
    const action = vi.fn()
    const result = await buddyChat([{ role: 'user', text: 'I am scared' }], {
      chatEnabled: true,
      apiKey: undefined,
      provider: 'anthropic',
      model: 'test',
      client: null,
      log: vi.fn(),
      resolveAction: action,
      contactButton: () => 'Ask Sarah to call'
    })
    expect(result.reply).toContain('Ask Sarah to call')
    expect(result.reply).not.toMatch(/notified|coming|sent|will call/)
    expect(action).not.toHaveBeenCalled()
  })
  it('does not invent a button when unconfigured, or divert ordinary conversation', () => {
    expect(directContactGuidance('I am scared', null)).toBeNull()
    expect(directContactGuidance('I like flowers', 'Ask Sarah to call')).toBeNull()
    expect(directContactGuidance("I'm not scared", 'Ask Sarah to call')).toBeNull()
    expect(directContactGuidance('My friend is scared', 'Ask Sarah to call')).toBeNull()
    expect(directContactGuidance('I was scared when I was young', 'Ask Sarah to call')).toBeNull()
    expect(contactGuidanceContext(null)).toContain('no callback button')
    expect(contactGuidanceContext('Ask Sarah to call')).toContain('cannot send a message from chat')
  })
})
