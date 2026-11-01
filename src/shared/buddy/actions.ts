import { z } from 'zod'

export const buddyActionSchema = z.enum(['playMusic', 'showPhotos', 'goHome'])
export type BuddyAction = z.infer<typeof buddyActionSchema>
const tileNameSchema = z.string().trim().min(1).max(2000)
export const buddyActionRequestSchema = z.union([
  buddyActionSchema,
  z.object({ action: z.literal('openTile'), name: tileNameSchema }).strict(),
  z
    .object({
      action: z.literal('chooseTile'),
      tileId: z.string().min(1),
      expectedLabel: z.string()
    })
    .strict()
])
export type BuddyActionRequest = z.infer<typeof buddyActionRequestSchema>
export type BuddyTileChoice = { tileId: string; label: string; position: string }
export type BuddyActionPlan =
  | { action: 'playMusic'; playlistId: string }
  | { action: 'showPhotos' | 'goHome' }
  | { action: 'openTile'; tileId: string }
/** `unknownTile`: the request named no saved tile at all, so it may be conversation instead. */
export type BuddyActionResult =
  | { ok: true; plan: BuddyActionPlan }
  | { ok: false; reply: string; choices?: BuddyTileChoice[]; unknownTile?: true }

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
  home: 'Here we are, back Home.',
  tileUnavailable: "That choice isn't on Home right now. You can choose another one.",
  tileAmbiguous: 'Which one would you like? Click a choice below.',
  tileOpened: 'Here it is.',
  tileFailed: "That didn't open just now. Let's try something else."
} as const

/** Whole requests only; a tile target must still match a current saved label in main. */
export function explicitBuddyAction(value: string): BuddyActionRequest | null {
  const text = value
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:please |can you |could you |would you )+/, '')
    .replace(/ please$/, '')
  if (/^play (?:my |some )?music$/.test(text)) return 'playMusic'
  if (/^show (?:me )?(?:my |the )?(?:pictures|photos)$/.test(text)) return 'showPhotos'
  if (/^(?:go|take me|bring me) (?:back )?home$/.test(text)) return 'goHome'
  const tile = /^(?:open|go to|show me|take me to|bring me to|launch) (.+)$/.exec(text)
  if (tile) return { action: 'openTile', name: tile[1]! }
  return null
}

const TOOL_ACTIONS: Record<string, BuddyAction> = {
  play_my_music: 'playMusic',
  show_my_pictures: 'showPhotos',
  go_home: 'goHome'
}
export function actionFromTool(name: string, input: unknown): BuddyActionRequest | null {
  if (name === 'open_saved_tile') {
    const parsed = z.object({ name: tileNameSchema }).strict().safeParse(input)
    return parsed.success ? { action: 'openTile', name: parsed.data.name } : null
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
    return null
  return Object.hasOwn(TOOL_ACTIONS, name) ? TOOL_ACTIONS[name]! : null
}
