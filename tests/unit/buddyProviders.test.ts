import { describe, expect, it } from 'vitest'
import {
  BUDDY_MODELS,
  BUDDY_PROVIDERS,
  DEFAULT_BUDDY_PROVIDER,
  OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_PREFERENCES,
  defaultModelFor,
  modelAcceptsEffort,
  modelsFor
} from '@shared/buddy/providers'

/**
 * These pin the two decisions that make offering OpenRouter safe rather than
 * merely convenient: which endpoint it is, and that her chat is pinned to
 * Anthropic through it.
 */
describe('buddy providers', () => {
  it('defaults to Anthropic direct, so nothing changes for an existing setup', () => {
    expect(DEFAULT_BUDDY_PROVIDER).toBe('anthropic')
    expect(BUDDY_PROVIDERS).toContain('anthropic')
    expect(BUDDY_PROVIDERS).toContain('openrouter')
  })

  it('points the SDK at a base URL it appends /v1/messages to', () => {
    // The documented OpenRouter base is .../api/v1 and the SDK adds /v1/messages,
    // so passing that verbatim would request /api/v1/v1/messages.
    expect(OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api')
    expect(`${OPENROUTER_BASE_URL}/v1/messages`).toBe(
      'https://openrouter.ai/api/v1/messages'
    )
  })

  it('pins OpenRouter traffic to Anthropic and refuses fallbacks', () => {
    // Left alone, OpenRouter serves Claude from Amazon Bedrock and Google Vertex
    // too. That would move her conversations off Anthropic and off the endpoint
    // the prompt was tuned against, so the request says no.
    expect(OPENROUTER_PROVIDER_PREFERENCES.only).toEqual(['Anthropic'])
    expect(OPENROUTER_PROVIDER_PREFERENCES.allow_fallbacks).toBe(false)
    expect(OPENROUTER_PROVIDER_PREFERENCES.data_collection).toBe('deny')
  })

  it('offers only the two models the prompt was checked against, under each provider slug', () => {
    expect(modelsFor('openrouter').map((m) => m.id)).toEqual([
      'anthropic/claude-sonnet-5.5',
      'anthropic/claude-haiku-4.5'
    ])
    // Both lists lead with Sonnet, for the reason in the task notes: Haiku plays
    // along with confused statements.
    for (const provider of BUDDY_PROVIDERS) {
      expect(defaultModelFor(provider)).toBe(BUDDY_MODELS[provider][0]!.id)
      expect(defaultModelFor(provider)).toContain('sonnet')
    }
    expect(modelsFor('anthropic').map((m) => m.id)).toContain('claude-sonnet-5-5')
    // Model ids never cross providers, so an id from one list is never in the other.
    expect(modelsFor('openrouter').some((m) => m.id === 'claude-sonnet-5-5')).toBe(false)
  })

  it('never sends effort to Haiku, whichever provider it came from', () => {
    // The trap this guards: a naive startsWith('claude-haiku') misses the
    // vendor/ prefix OpenRouter requires, and Haiku rejects output_config.
    expect(modelAcceptsEffort('claude-haiku-4-5')).toBe(false)
    expect(modelAcceptsEffort('anthropic/claude-haiku-4.5')).toBe(false)
    expect(modelAcceptsEffort('claude-sonnet-5-5')).toBe(true)
    expect(modelAcceptsEffort('anthropic/claude-sonnet-5.5')).toBe(true)
    expect(modelAcceptsEffort('anthropic/claude-opus-5')).toBe(true)
  })
})
