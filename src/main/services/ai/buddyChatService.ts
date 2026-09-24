import Anthropic from '@anthropic-ai/sdk'
import type { BuddyChatTurn, BuddyChatResult } from '@shared/ipcContract'
import { BUDDY_SYSTEM_PROMPT } from './buddyPrompt'

/**
 * Buddy's real conversation (M4). The renderer owns the on-screen history
 * and sends it each turn; everything that touches the API - key, model,
 * prompt, error handling - lives here in main.
 *
 * Every failure path returns a calm, in-character line rather than an
 * error, so grandma never sees "401" or "network error" - the technical
 * reason goes to the activity log for the caregiver instead.
 */

export const MAX_TURNS = 20
export const MAX_TURN_CHARS = 2000

export const REPLIES = {
  noKey: "I'd love to chat, but my talking isn't switched on yet. Your family can help set me up.",
  unavailable: "I'm having a little trouble hearing you right now. Let's try again in a bit.",
  declined: "Let's talk about something else. How has your day been?"
} as const

type MessagesClient = Pick<Anthropic, 'messages'>

/**
 * Makes renderer-supplied history safe to send: drops blanks, caps length
 * and turn count, and ensures it starts with a user turn (the panel opens
 * with an assistant greeting, which the API doesn't accept as the first
 * message). Consecutive same-role turns are merged rather than rejected.
 */
export function toApiMessages(turns: BuddyChatTurn[]): Anthropic.MessageParam[] {
  const cleaned = turns
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_CHARS) }))
    .filter((t) => t.text.length > 0)
    .slice(-MAX_TURNS)

  while (cleaned.length > 0 && cleaned[0]!.role !== 'user') cleaned.shift()

  const messages: Anthropic.MessageParam[] = []
  for (const turn of cleaned) {
    const last = messages[messages.length - 1]
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${turn.text}`
    } else {
      messages.push({ role: turn.role, content: turn.text })
    }
  }
  return messages
}

/** Haiku 4.5 rejects `effort`; newer models accept it and default higher than a chat needs. */
function supportsEffort(model: string): boolean {
  return !model.startsWith('claude-haiku')
}

export async function buddyChat(
  turns: BuddyChatTurn[],
  opts: { apiKey: string | undefined; model: string; client: MessagesClient | null; log: (type: string, detail?: string) => void }
): Promise<BuddyChatResult> {
  if (!opts.apiKey || !opts.client) {
    return { ok: false, reason: 'no-key', reply: REPLIES.noKey }
  }

  const messages = toApiMessages(turns)
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') {
    return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
  }

  try {
    const response = await opts.client.messages.create({
      model: opts.model,
      max_tokens: 4096,
      system: BUDDY_SYSTEM_PROMPT,
      messages,
      ...(supportsEffort(opts.model) ? { output_config: { effort: 'low' as const } } : {})
    })

    if (response.stop_reason === 'refusal') {
      opts.log('buddy-chat-declined', response.stop_details?.category ?? undefined)
      return { ok: false, reason: 'declined', reply: REPLIES.declined }
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) {
      opts.log('buddy-chat-error', `empty reply (stop_reason=${response.stop_reason})`)
      return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
    }
    return { ok: true, reply: text }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      opts.log('buddy-chat-error', 'API key rejected - re-enter it in the Buddy tab')
    } else if (err instanceof Anthropic.NotFoundError) {
      opts.log('buddy-chat-error', `model not found: ${opts.model}`)
    } else if (err instanceof Anthropic.RateLimitError) {
      opts.log('buddy-chat-error', 'rate limited')
    } else if (err instanceof Anthropic.APIConnectionError) {
      opts.log('buddy-chat-error', 'no connection to the Anthropic API')
    } else if (err instanceof Anthropic.APIError) {
      opts.log('buddy-chat-error', `API error ${err.status}: ${err.message}`)
    } else {
      opts.log('buddy-chat-error', String(err))
    }
    return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
  }
}
