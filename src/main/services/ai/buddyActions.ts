import {
  ACTION_REPLIES,
  buddyActionRequestSchema,
  type BuddyActionRequest,
  type BuddyActionResult
} from '@shared/buddy/actions'
import { BUILTIN_TILE_KEYS, type Config } from '@shared/configSchema'
import { tilesInHome, slotDescription } from '@shared/homeLayout'
import { isAllowedUrl } from '../browser/urlPolicy'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import type { MediaLibrary } from '@shared/media/mediaPath'

export const BUDDY_ACTION_TOOLS: {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties: boolean
  }
}[] = [
  ...[
    ['play_my_music', 'Start her saved music.'],
    ['show_my_pictures', 'Open her approved pictures.'],
    ['go_home', 'Return to Home.']
  ].map(([name, description]) => ({
    name: name!,
    description: `${description} Use only when she asks for this action. The app checks availability and executes it; never say it happened before a successful result. These are the only actions available.`,
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false }
  })),
  {
    name: 'open_saved_tile',
    description:
      'Open a caregiver-saved Home tile when she asks to go there. Supply only the tile name she requested, never a URL or path. The app matches current visible names and asks her to choose if ambiguous. Never claim it opened: the app confirms only after opening succeeds.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false
    }
  }
]

/** "Open the News" should find a tile called "News"; a leading article is never part of a name. */
function normalizedName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:the|my|a|an) /, '')
}

/** Plans contain only saved IDs. The renderer must perform the action before confirming it. */
export async function resolveBuddyAction(
  action: BuddyActionRequest,
  config: Config,
  list: (kind: MediaLibrary) => Promise<LibraryEntry[]>,
  exists: (kind: MediaLibrary, entry: LibraryEntry) => Promise<boolean>
): Promise<BuddyActionResult> {
  if (!config.buddy.chatEnabled) return { ok: false, reply: ACTION_REPLIES.unavailable }
  if (!buddyActionRequestSchema.safeParse(action).success)
    return { ok: false, reply: ACTION_REPLIES.unavailable }
  if (typeof action === 'object') {
    // Use Home's actual placement rules, including overflow and overlapping slots.
    // Searching the whole saved list would expose choices she cannot see or tap.
    const visible = tilesInHome(config.display.homeLayout, config.tiles)
    const matches =
      action.action === 'openTile'
        ? visible.filter((tile) => normalizedName(tile.label) === normalizedName(action.name))
        : visible.filter((tile) => tile.id === action.tileId && tile.label === action.expectedLabel)
    if (matches.length > 1)
      return {
        ok: false,
        reply: ACTION_REPLIES.tileAmbiguous,
        choices: matches.map((tile) => ({
          tileId: tile.id,
          label: tile.label,
          position: slotDescription(config.display.homeLayout, tile.slot)
        }))
      }
    const tile = matches[0]
    // Named nothing she has saved at all ("show me how to make tea"): chat may
    // answer that instead. A saved but hidden tile still gets the calm reply.
    if (
      !tile &&
      action.action === 'openTile' &&
      !config.tiles.some((saved) => normalizedName(saved.label) === normalizedName(action.name))
    )
      return { ok: false, reply: ACTION_REPLIES.tileUnavailable, unknownTile: true }
    if (
      !tile ||
      (tile.type === 'web' && (!tile.url || !isAllowedUrl(tile.url))) ||
      (tile.type === 'app' && !tile.appPath) ||
      (tile.type === 'builtin' &&
        !(BUILTIN_TILE_KEYS as readonly string[]).includes(tile.builtinKey ?? ''))
    )
      return { ok: false, reply: ACTION_REPLIES.tileUnavailable }
    return { ok: true, plan: { action: 'openTile', tileId: tile.id } }
  }
  if (action === 'goHome') return { ok: true, plan: { action } }
  try {
    if (action === 'showPhotos') {
      for (const entry of await list('photos')) {
        if (entry.metadata.showToHer === true && (await exists('photos', entry)))
          return { ok: true, plan: { action } }
      }
      return { ok: false, reply: ACTION_REPLIES.photosUnavailable }
    }
    const tracks = new Map((await list('music')).map((entry) => [entry.id, entry]))
    for (const playlist of config.music.playlists) {
      for (const id of playlist.trackIds) {
        const entry = tracks.get(id)
        if (entry && (await exists('music', entry)))
          return { ok: true, plan: { action, playlistId: playlist.id } }
      }
    }
    return { ok: false, reply: ACTION_REPLIES.musicUnavailable }
  } catch {
    return {
      ok: false,
      reply:
        action === 'showPhotos' ? ACTION_REPLIES.photosUnavailable : ACTION_REPLIES.musicUnavailable
    }
  }
}
