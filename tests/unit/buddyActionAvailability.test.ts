import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'
import { resolveBuddyAction } from '../../src/main/services/ai/buddyActions'
import { ACTION_REPLIES } from '../../src/shared/buddy/actions'
import type { LibraryEntry } from '../../src/shared/media/libraryTypes'

const entry: LibraryEntry = { id: 'song', fileName: 'song.wav', metadata: {} }
describe('saved media resolution for Buddy actions', () => {
  it('chooses the first caregiver playlist with a surviving saved track, skipping missing references and files', async () => {
    const config = defaultConfig()
    config.music.playlists = [
      { id: 'broken', label: 'Missing', shuffle: false, trackIds: ['unknown'] },
      { id: 'first', label: 'First', shuffle: false, trackIds: ['song'] },
      { id: 'later', label: 'Later', shuffle: false, trackIds: ['song'] }
    ]
    expect(
      await resolveBuddyAction(
        'playMusic',
        config,
        async () => [entry],
        async () => true
      )
    ).toEqual({ ok: true, plan: { action: 'playMusic', playlistId: 'first' } })
    expect(
      await resolveBuddyAction(
        'playMusic',
        config,
        async () => [entry],
        async () => false
      )
    ).toEqual({ ok: false, reply: ACTION_REPLIES.musicUnavailable })
  })
  it('does not expose hidden photos or count missing approved files as ready', async () => {
    const list = vi.fn().mockResolvedValue([entry])
    const exists = vi.fn().mockResolvedValue(true)
    expect((await resolveBuddyAction('showPhotos', defaultConfig(), list, exists)).ok).toBe(false)
    expect(exists).not.toHaveBeenCalled()
    list.mockResolvedValue([{ ...entry, metadata: { showToHer: true } }])
    exists.mockResolvedValue(false)
    expect((await resolveBuddyAction('showPhotos', defaultConfig(), list, exists)).ok).toBe(false)
    exists.mockResolvedValue(true)
    expect(await resolveBuddyAction('showPhotos', defaultConfig(), list, exists)).toEqual({
      ok: true,
      plan: { action: 'showPhotos' }
    })
  })
  it('gives a kind unavailable response for an unreadable index and does not leak the error', async () => {
    const list = async (): Promise<LibraryEntry[]> => {
      throw new Error('private/path/caption')
    }
    expect(await resolveBuddyAction('showPhotos', defaultConfig(), list, async () => true)).toEqual(
      { ok: false, reply: ACTION_REPLIES.photosUnavailable }
    )
  })
  it('disabled chat cannot request any action; Home itself needs no media', async () => {
    const config = defaultConfig(),
      list = vi.fn(),
      exists = vi.fn()
    expect(await resolveBuddyAction('goHome', config, list, exists)).toEqual({
      ok: true,
      plan: { action: 'goHome' }
    })
    config.buddy.chatEnabled = false
    expect((await resolveBuddyAction('goHome', config, list, exists)).ok).toBe(false)
    expect(list).not.toHaveBeenCalled()
  })
})
