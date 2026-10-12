import Anthropic from '@anthropic-ai/sdk'
import {
  OPENROUTER_ATTRIBUTION,
  OPENROUTER_BASE_URL,
  type BuddyProvider
} from '@shared/buddy/providers'

/**
 * The only place an API key becomes a client. Main-process only - the key is
 * read from config here and never crosses IPC to any renderer.
 *
 * Two providers share this because OpenRouter serves the Anthropic Messages
 * format (POST /api/v1/messages with Anthropic-shaped errors), so there is one
 * SDK, one system prompt and one set of error types either way. Only the base
 * URL and a couple of attribution headers differ; those come from
 * shared/buddy/providers.ts so they can be unit tested.
 *
 * Clients are cached per provider+key and rebuilt only when either changes (the
 * caregiver switching provider, or entering a new key), not per request.
 */
let cachedProvider: BuddyProvider | null = null
let cachedKey: string | null = null
let cachedClient: Anthropic | null = null

export function getBuddyChatClient(provider: BuddyProvider, apiKey: string): Anthropic {
  if (cachedClient && cachedKey === apiKey && cachedProvider === provider) return cachedClient
  cachedClient = new Anthropic({
    apiKey,
    // She's waiting on screen for a reply - fail over to the friendly
    // "try again later" line quickly rather than hanging for minutes.
    timeout: 30_000,
    maxRetries: 1,
    ...(provider === 'openrouter'
      ? { baseURL: OPENROUTER_BASE_URL, defaultHeaders: { ...OPENROUTER_ATTRIBUTION } }
      : {})
  })
  cachedKey = apiKey
  cachedProvider = provider
  return cachedClient
}
