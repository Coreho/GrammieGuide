import Anthropic from '@anthropic-ai/sdk'

/**
 * The only place the Anthropic API key is turned into a client. Main-process
 * only - the key is read from config here and never crosses IPC to any
 * renderer. The client is rebuilt only when the key changes (e.g. the
 * caregiver enters a new one), not per request.
 */
let cachedKey: string | null = null
let cachedClient: Anthropic | null = null

export function getAnthropicClient(apiKey: string): Anthropic {
  if (cachedClient && cachedKey === apiKey) return cachedClient
  cachedClient = new Anthropic({
    apiKey,
    // She's waiting on screen for a reply - fail over to the friendly
    // "try again later" line quickly rather than hanging for minutes.
    timeout: 30_000,
    maxRetries: 1
  })
  cachedKey = apiKey
  return cachedClient
}
