import { describe, expect, it } from 'vitest'
import { BUDDY_PROVIDERS, DEFAULT_BUDDY_PROVIDER } from '@shared/buddy/providers'
import { buddyConfigSchema, defaultConfig } from '@shared/configSchema'
describe('ChatGPT-only Buddy', () => {
  it('offers only ChatGPT and requires an account-discovered model', () => {
    expect(BUDDY_PROVIDERS).toEqual(['chatgpt'])
    expect(DEFAULT_BUDDY_PROVIDER).toBe('chatgpt')
    expect(defaultConfig().buddy.model).toBe('')
    for (const provider of ['anthropic', 'openrouter'])
      expect(buddyConfigSchema.safeParse({ provider }).success).toBe(false)
  })
  it('strips obsolete credentials from current settings', () => {
    expect(
      buddyConfigSchema.parse({ anthropicApiKey: 'old', openrouterApiKey: 'old' })
    ).not.toHaveProperty('anthropicApiKey')
    expect(
      buddyConfigSchema.parse({ anthropicApiKey: 'old', openrouterApiKey: 'old' })
    ).not.toHaveProperty('openrouterApiKey')
  })
})
