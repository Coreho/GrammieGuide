import { describe, expect, it } from 'vitest'
import { configSchema, defaultConfig, CURRENT_SCHEMA_VERSION } from '../../src/shared/configSchema'
import { migrations } from '../../src/main/config/migrations'
import { runMigrations } from '../../src/main/config/migrations/runner'

describe('photo viewer settings and migration 009', () => {
  it('keeps photos still by default', () => {
    expect(defaultConfig()).toHaveProperty('photos.slideshowEnabled', false)
  })

  it('upgrades schema 8 with the slideshow off without changing tiles or secrets', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 8,
      photos: undefined,
      tiles: [
        {
          id: 'photos',
          type: 'builtin',
          builtinKey: 'photos',
          label: 'Family photos',
          size: 'normal',
          colorIndex: 1,
          slot: 2
        }
      ],
      buddy: { ...defaultConfig().buddy, ttsVoice: 'private-key' }
    }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config).toHaveProperty('photos.slideshowEnabled', false)
    expect(result.config.tiles).toEqual(raw.tiles)
    expect(result.config.buddy.ttsVoice).toBe('private-key')
    expect(raw).toEqual(before)
    expect(runMigrations(result.config).config).toEqual(result.config)
  })

  it.each([false, true])(
    'preserves an explicit slideshowEnabled=%s on upgrade',
    (slideshowEnabled) => {
      const raw = { ...defaultConfig(), schemaVersion: 8, photos: { slideshowEnabled } }
      const result = runMigrations(raw)
      expect(result.ok).toBe(true)
      expect(result.config).toHaveProperty('photos.slideshowEnabled', slideshowEnabled)
    }
  )

  it('registers a pure migration that handles absent photo settings', () => {
    const migration = migrations.find((entry) => entry.version === 9)
    expect(migration).toBeDefined()
    expect(migration?.migrate({ schemaVersion: 8 })).toEqual({
      schemaVersion: 9,
      photos: { slideshowEnabled: false }
    })
  })

  it.each(['true', null, 1])('rejects a non-boolean slideshow setting %s', (slideshowEnabled) => {
    expect(
      configSchema.safeParse({ ...defaultConfig(), photos: { slideshowEnabled } }).success
    ).toBe(false)
  })
})
