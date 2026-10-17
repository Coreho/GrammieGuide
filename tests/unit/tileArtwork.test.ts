import { describe, expect, it } from 'vitest'
import { defaultConfig, tileSchema, CURRENT_SCHEMA_VERSION } from '../../src/shared/configSchema'
import { tileArtworkFor } from '../../src/shared/tileArtwork'
import { runMigrations } from '../../src/main/config/migrations/runner'

describe('named card artwork', () => {
  it('keeps artwork independent of labels and destination kind', () => {
    expect(tileArtworkFor({ type: 'web', artwork: 'games', builtinKey: 'weather' })).toBe('games')
    expect(tileArtworkFor({ type: 'app', artwork: 'websites' })).toBe('websites')
    expect(tileArtworkFor({ type: 'web', builtinKey: 'photos' })).toBeUndefined()
    expect(tileArtworkFor({ type: 'builtin', builtinKey: 'websites' })).toBeUndefined()
    expect(tileArtworkFor({ type: 'builtin', builtinKey: 'games' })).toBe('games')
    expect(tileArtworkFor({ type: 'builtin', builtinKey: 'photos' })).toBe('photos')
  })
  it('lets explicit icons and selected photos override artwork', () => {
    expect(tileArtworkFor({ type: 'web', artwork: 'games', icon: '🌷' })).toBeUndefined()
    expect(
      tileArtworkFor({ type: 'web', artwork: 'websites', photoId: 'saved-photo' })
    ).toBeUndefined()
  })
  it('rejects paths and remote artwork URLs', () => {
    const tile = { id: 'web', type: 'web', label: 'Games', colorIndex: 0, slot: 2 }
    expect(tileSchema.parse({ ...tile, artwork: 'games' }).artwork).toBe('games')
    for (const artwork of ['https://example.com/image.png', '../file', 'constructor'])
      expect(tileSchema.safeParse({ ...tile, artwork }).success).toBe(false)
  })
  it('upgrades without guessing selections or changing saved themes, slots and destinations', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 11,
      tiles: [
        {
          id: 'web',
          type: 'web',
          label: 'Games',
          colorIndex: 2,
          size: 'wide',
          slot: 0,
          url: 'https://example.com',
          icon: '🌐'
        }
      ]
    }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.tiles).toEqual(raw.tiles)
    expect(result.config.display).toEqual(raw.display)
    expect(raw).toEqual(before)
  })
})
