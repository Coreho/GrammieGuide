import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, defaultConfig, tileSchema } from '../../src/shared/configSchema'
import { runMigrations } from '../../src/main/config/migrations/runner'
import { migration } from '../../src/main/config/migrations/010-tile-photos'

const tile = { id: 'home', type: 'web', label: 'Family', colorIndex: 0, size: 'normal', slot: 2 }
const photoId = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'

describe('tile photo settings', () => {
  it('preserves existing icons, slots and secrets without inventing a photo selection', () => {
    const raw = { ...defaultConfig(), schemaVersion: 9, tiles: [{ ...tile, icon: '🌐' }] }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.tiles).toEqual(raw.tiles)
    expect(result.config.tiles[0]).not.toHaveProperty('photoId')
    expect(raw).toEqual(before)
    expect(migration.migrate({ schemaVersion: 9 })).toEqual({ schemaVersion: 10 })
  })

  it('stores only a managed ID for each supported tile kind', () => {
    for (const type of ['web', 'app', 'builtin']) {
      expect(tileSchema.parse({ ...tile, type, photoId }).photoId).toBe(photoId)
    }
  })

  it.each(['file:///private/picture.jpg', '../picture.jpg', 'https://example.com/photo', '', null])(
    'rejects a photo path or invalid ID %s',
    (value) => {
      expect(tileSchema.safeParse({ ...tile, photoId: value }).success).toBe(false)
    }
  )
})
