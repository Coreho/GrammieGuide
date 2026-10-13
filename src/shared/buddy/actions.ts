import { z } from 'zod'

export const buddyActionSchema = z.enum(['playMusic', 'showPhotos', 'goHome'])
export type BuddyAction = z.infer<typeof buddyActionSchema>
export type BuddyActionPlan =
  { action: 'playMusic'; playlistId: string } | { action: 'showPhotos' | 'goHome' }
export type BuddyActionResult = { ok: true; plan: BuddyActionPlan } | { ok: false; reply: string }

export const BUDDY_ACTION_LABELS: Record<BuddyAction, string> = {
  playMusic: 'Play my music',
  showPhotos: 'Show my pictures',
  goHome: 'Go Home'
}
export const ACTION_REPLIES = {
  musicUnavailable: "Your music isn't ready yet. Your family can help set it up.",
  photosUnavailable: "Your pictures aren't ready yet. Your family can help add them.",
  unavailable: "Let's try that again in a little while.",
  musicPlaying: 'Your music is playing.',
  musicFailed: "The music isn't ready yet.",
  photosOpening: "Let's look at your pictures.",
  home: 'Here we are, back Home.'
} as const

/** Whole requests only: mentions, negation and compound instructions go to chat. */
export function explicitBuddyAction(value: string): BuddyAction | null {
  const text = value
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:please |can you |could you |would you )/, '')
    .replace(/ please$/, '')
  if (/^play (?:my |some )?music$/.test(text)) return 'playMusic'
  if (/^show (?:me )?(?:my |the )?(?:pictures|photos)$/.test(text)) return 'showPhotos'
  if (/^(?:go|take me|bring me) (?:back )?home$/.test(text)) return 'goHome'
  return null
}

const TOOL_ACTIONS: Record<string, BuddyAction> = {
  play_my_music: 'playMusic',
  show_my_pictures: 'showPhotos',
  go_home: 'goHome'
}
export function actionFromTool(name: string, input: unknown): BuddyAction | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
    return null
  return Object.hasOwn(TOOL_ACTIONS, name) ? TOOL_ACTIONS[name]! : null
}
