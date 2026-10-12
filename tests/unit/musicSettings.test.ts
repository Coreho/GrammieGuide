import { describe, expect, it } from 'vitest'
import { defaultConfig, CURRENT_SCHEMA_VERSION } from '../../src/shared/configSchema'
import { musicSettingsSchema } from '../../src/shared/music/musicSchema'
import { runMigrations } from '../../src/main/config/migrations/runner'

const id = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'
const list = { id, label: 'Favorites', shuffle: false, trackIds: [id] }
describe('music configuration', () => {
  it('upgrades existing settings without losing tiles, secrets or explicit choices', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 10,
      music: { playlists: [list], autoStopMinutes: 45, showNowPlayingChip: false },
      buddy: { ...defaultConfig().buddy, openrouterApiKey: 'private' }
    }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.music).toEqual(raw.music)
    expect(result.config.buddy.openrouterApiKey).toBe('private')
    expect(raw).toEqual(before)
  })
  it('defaults to no playlists and a 90-minute auto-stop', () => {
    const result = runMigrations({ ...defaultConfig(), schemaVersion: 10, music: undefined })
    expect(result.config.music).toEqual({
      playlists: [],
      autoStopMinutes: 90,
      showNowPlayingChip: true
    })
  })
  it('rejects duplicate playlist IDs, duplicate tracks and more than six playlists', () => {
    const settings = defaultConfig().music
    expect(musicSettingsSchema.safeParse({ ...settings, playlists: [list, list] }).success).toBe(
      false
    )
    expect(
      musicSettingsSchema.safeParse({ ...settings, playlists: [{ ...list, trackIds: [id, id] }] })
        .success
    ).toBe(false)
    const lists = Array.from({ length: 7 }, (_, i) => ({
      ...list,
      id: `4c5fe7c6-76c4-4d8b-b19c-598d109fbcc${i}`
    }))
    expect(musicSettingsSchema.safeParse({ ...settings, playlists: lists }).success).toBe(false)
  })
  it.each([9, 481, 10.5, '90'])('rejects invalid auto-stop %s', (autoStopMinutes) => {
    expect(
      musicSettingsSchema.safeParse({ ...defaultConfig().music, autoStopMinutes }).success
    ).toBe(false)
  })
})
