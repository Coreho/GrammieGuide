import type { BuddyChatTurn, BuddyChatResult } from '@shared/ipcContract'
import type { ClipName } from '@shared/buddy/commands'
import type { BuddyMessage, BuddyCompletion } from './buddyCompletion'
import { directContactGuidance, contactGuidanceContext } from '@shared/buddy/contactGuidance'
import {
  actionFromTool,
  explicitBuddyAction,
  type BuddyActionRequest,
  type BuddyActionResult
} from '@shared/buddy/actions'
import {
  currentFacts,
  personalContext,
  type PersonalFact,
  type PersonalHistory
} from '@shared/buddy/personalFacts'
import { explicitGestureRequest, gestureFromTool, performGesture } from '@shared/buddy/gestures'
import type { BuddyMotion } from '@shared/buddy/buddyMachine'

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
  disabled: "I'm happy to sit here with you.",
  notConnected:
    "I'd love to chat, but my talking isn't switched on yet. Your family can help set me up.",
  unavailable: "I'm having a little trouble hearing you right now. Let's try again in a bit.",
  declined: "Let's talk about something else. How has your day been?"
} as const

/**
 * Makes renderer-supplied history safe to send: drops blanks, caps length
 * and turn count, and ensures it starts with a user turn (the panel opens
 * with an assistant greeting, which the API doesn't accept as the first
 * message). Consecutive same-role turns are merged rather than rejected.
 */
export function toApiMessages(turns: BuddyChatTurn[]): BuddyMessage[] {
  const cleaned = turns
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_CHARS) }))
    .filter((t) => t.text.length > 0)
    .slice(-MAX_TURNS)

  while (cleaned.length > 0 && cleaned[0]!.role !== 'user') cleaned.shift()

  const messages: BuddyMessage[] = []
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

function gestureResult(
  gesture: Parameters<typeof performGesture>[0],
  motion: BuddyMotion = 'roam'
): { reply: string; gesture: ClipName } {
  const { clip, reply } = performGesture(gesture, motion)
  return { reply, gesture: clip }
}

export async function buddyChat(
  turns: BuddyChatTurn[],
  opts: {
    chatEnabled: boolean
    /** Reduced motion swaps a requested dance for a calm wave. */
    motion?: BuddyMotion
    generate?: (messages: BuddyMessage[]) => Promise<BuddyCompletion>
    log: (type: string, detail?: string) => void
    resolveAction?: (action: BuddyActionRequest) => Promise<BuddyActionResult>
    contactButton?: () => string | null
    personal?: {
      facts: () => PersonalFact[]
      history: PersonalHistory
      now?: () => Date
      timeZone?: string
    }
  }
): Promise<BuddyChatResult> {
  if (!opts.chatEnabled) {
    return { ok: false, reason: 'disabled', reply: REPLIES.disabled }
  }

  const last = turns.at(-1)
  const contactButton = opts.contactButton?.() ?? null
  const contactReply =
    last?.role === 'user' && typeof last.text === 'string'
      ? directContactGuidance(last.text, contactButton)
      : null
  if (contactReply) return { ok: true, reply: contactReply }
  // "Buddy, dance!" needs no model either. Checked before Home actions, so
  // "show me a trick" is a trick rather than a search for a tile.
  const gesture =
    last?.role === 'user' && typeof last.text === 'string'
      ? explicitGestureRequest(last.text)
      : null
  if (gesture) return { ok: true, ...gestureResult(gesture, opts.motion) }
  const direct =
    last?.role === 'user' && typeof last.text === 'string' ? explicitBuddyAction(last.text) : null
  const toChatResult = (result: BuddyActionResult): BuddyChatResult =>
    result.ok
      ? { ok: true, reply: '', action: result.plan }
      : {
          ok: false,
          reason: 'unavailable',
          reply: result.reply,
          ...(result.choices ? { choices: result.choices } : {})
        }
  // Her explicit request needs no model, network or key. General wording can
  // propose one of the same tools below; neither path executes model text.
  const directResult = direct && opts.resolveAction ? await opts.resolveAction(direct) : null
  const hasChat = Boolean(opts.generate)
  // "Show me how to make tea" names no saved tile: with chat available that is
  // conversation, not a failed request to open something.
  if (directResult && !(hasChat && !directResult.ok && directResult.unknownTile))
    return toChatResult(directResult)

  if (!hasChat) {
    return { ok: false, reason: 'not-connected', reply: REPLIES.notConnected }
  }

  const now = opts.personal?.now?.() ?? new Date()
  const timeZone = opts.personal?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const facts = currentFacts(opts.personal?.facts() ?? [], now, timeZone)
  const factsSignature = JSON.stringify(facts)
  const messages = toApiMessages(
    opts.personal ? opts.personal.history.prepare(turns, facts) : turns
  )
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') {
    return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
  }
  if (opts.personal) {
    const latest = messages.at(-1)!
    latest.content = `${personalContext(facts, now, timeZone)}\n\nHer message:\n${latest.content as string}`
  }
  if (opts.contactButton) {
    const latest = messages.at(-1)!
    latest.content = `${contactGuidanceContext(contactButton)}\n\n${latest.content as string}`
  }

  try {
    const completion = await opts.generate!(messages)
    if (opts.contactButton && opts.contactButton() !== contactButton) {
      return {
        ok: false,
        reason: 'unavailable',
        reply: "I'm here with you. You can tell someone nearby if you need help."
      }
    }

    // A caregiver may cancel a visit while Buddy is thinking, or local midnight
    // may pass. Never release text/tools generated against that stale context.
    if (
      opts.personal &&
      JSON.stringify(
        currentFacts(opts.personal.facts(), opts.personal.now?.() ?? new Date(), timeZone)
      ) !== factsSignature
    ) {
      return { ok: true, reply: 'I am not sure about that. Your family can help.' }
    }
    if (completion.refused) {
      opts.log('buddy-chat-declined')
      return { ok: false, reason: 'declined', reply: REPLIES.declined }
    }

    const tools = completion.tools
    if (tools.length) {
      const tool = tools[0]!
      const requested = tools.length === 1 ? gestureFromTool(tool.name, tool.input) : null
      if (requested) return { ok: true, ...gestureResult(requested, opts.motion) }
      const action = tools.length === 1 ? actionFromTool(tool.name, tool.input) : null
      if (!action || !opts.resolveAction)
        return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
      // Discard accompanying model text, which may claim premature success.
      return toChatResult(await opts.resolveAction(action))
    }

    const text = completion.text.trim()
    if (!text) {
      opts.log('buddy-chat-error', 'empty completed reply')
      return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
    }
    return { ok: true, reply: text }
  } catch {
    // Provider errors can echo private conversation or tool inputs.
    opts.log('buddy-chat-error', 'request failed')
    return { ok: false, reason: 'unavailable', reply: REPLIES.unavailable }
  }
}
