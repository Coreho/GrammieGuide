import type Anthropic from '@anthropic-ai/sdk'
import { ACTION_REPLIES, type BuddyAction, type BuddyActionResult } from '@shared/buddy/actions'
import type { Config } from '@shared/configSchema'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import type { MediaLibrary } from '@shared/media/mediaPath'

export const BUDDY_ACTION_TOOLS: Anthropic.Tool[] = [
  ['play_my_music', 'Start her saved music.'],
  ['show_my_pictures', 'Open her approved pictures.'],
  ['go_home', 'Return to Home.']
].map(([name, description]) => ({
  name: name!,
  description: `${description} Use only when she asks for this action. The app checks availability and executes it; never say it happened before a successful result. These are the only actions available.`,
  input_schema: { type: 'object', properties: {}, additionalProperties: false }
}))

/** Plans contain only saved IDs. The renderer must perform the action before confirming it. */
export async function resolveBuddyAction(
  action: BuddyAction,
  config: Config,
  list: (kind: MediaLibrary) => Promise<LibraryEntry[]>,
  exists: (kind: MediaLibrary, entry: LibraryEntry) => Promise<boolean>
): Promise<BuddyActionResult> {
  if (!config.buddy.chatEnabled) return { ok: false, reply: ACTION_REPLIES.unavailable }
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
