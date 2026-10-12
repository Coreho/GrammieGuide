/**
 * Which company answers Buddy's chat, and which models it may use.
 *
 * Pure data and pure functions, in shared/ for the same reason urlPolicy.ts and
 * webHardening.ts are: the admin renderer needs the model lists to draw its
 * dropdown, main needs the base URL and the routing preference, and Vitest can
 * check both without Electron or a network.
 *
 * Why two providers at all: Anthropic direct is the default and stays that way,
 * because it is the endpoint the prompt was tuned against. OpenRouter is there
 * for a caregiver who already pays through it - it serves the same Anthropic
 * Messages format, so there is no second client and no second prompt.
 */

export const BUDDY_PROVIDERS = ['anthropic', 'openrouter'] as const
export type BuddyProvider = (typeof BUDDY_PROVIDERS)[number]

export const DEFAULT_BUDDY_PROVIDER: BuddyProvider = 'anthropic'

export type BuddyModelChoice = { id: string; label: string }

/**
 * Anthropic's own model ids, straight from the API.
 *
 * Sonnet leads because live checks found Haiku still agreeing with confused
 * statements ("I'm sure it will be nice to see her") despite the prompt - that
 * is why Haiku is labelled rather than quietly offered as equal.
 */
const ANTHROPIC_MODELS: BuddyModelChoice[] = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 - gentlest with confused statements (recommended)' },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5 - fastest, lowest cost, more likely to play along with confused statements'
  },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 - more thoughtful, slower' },
  { id: 'claude-opus-5', label: 'Claude Opus 5 - most capable, highest cost' }
]

/**
 * The same two models as Anthropic direct, under OpenRouter's `vendor/model`
 * slugs. Only Sonnet 5.5 and Haiku 4.5 are offered on purpose: this app's
 * prompt was tuned against exactly those two, and OpenRouter lists sixteen
 * Claude slugs, most of which have never met it. A caregiver who wants a
 * different one can still type it - the admin shows an unrecognised saved model
 * in the dropdown rather than hiding it.
 */
const OPENROUTER_MODELS: BuddyModelChoice[] = [
  {
    id: 'anthropic/claude-sonnet-5.5',
    label: 'Claude Sonnet 5.5 via OpenRouter - gentlest with confused statements (recommended)'
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5 via OpenRouter - cheapest, more likely to play along with confused statements'
  }
]

export const BUDDY_MODELS: Record<BuddyProvider, BuddyModelChoice[]> = {
  anthropic: ANTHROPIC_MODELS,
  openrouter: OPENROUTER_MODELS
}

/** The model a fresh setup uses, and the one switching to that provider lands on. */
export function defaultModelFor(provider: BuddyProvider): string {
  return BUDDY_MODELS[provider][0]!.id
}

export function modelsFor(provider: BuddyProvider): BuddyModelChoice[] {
  return BUDDY_MODELS[provider]
}

/**
 * OpenRouter serves the Anthropic Messages format, so the same SDK and the same
 * system prompt work. The SDK appends `/v1/messages`, hence dropping `/api/v1`
 * here - passing the documented base verbatim would request /api/v1/v1/messages.
 */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api'

export const OPENROUTER_ATTRIBUTION = {
  'HTTP-Referer': 'https://github.com/Coreho/GrammieGuide',
  'X-OpenRouter-Title': 'GrammieGuide'
} as const

/**
 * Route only to Anthropic's own endpoint, and take no fallback.
 *
 * This is the whole reason OpenRouter is safe to offer here. Left to itself it
 * serves Claude from Amazon Bedrock or Google Vertex too, which is cheaper but
 * means her conversations leave Anthropic - and the prompt tuning behind TASK-11
 * was verified against Anthropic's endpoint specifically. `data_collection: deny`
 * additionally refuses endpoints that retain data.
 *
 * A hard pin means a request errors rather than silently rerouting when
 * Anthropic is unavailable. That is the intended trade: a calm "try again later"
 * line beats a different company's model answering as Buddy.
 */
export const OPENROUTER_PROVIDER_PREFERENCES = {
  only: ['Anthropic'],
  allow_fallbacks: false,
  data_collection: 'deny'
} as const

/**
 * Haiku rejects `output_config`, so it must not be sent there. The check looks
 * past OpenRouter's `vendor/` prefix, which a naive startsWith would miss and so
 * would send effort to a model that refuses it.
 */
export function modelAcceptsEffort(model: string): boolean {
  const bare = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
  return !bare.startsWith('claude-haiku')
}
