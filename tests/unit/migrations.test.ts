import { describe, expect, it } from 'vitest'
import { buddyConfigSchema, defaultConfig } from '../../src/shared/configSchema'
import { migrations } from '../../src/main/config/migrations'
import { runMigrations } from '../../src/main/config/migrations/runner'

describe('Buddy chat setting and migration 007', () => {
  it('enables chat by default and rejects non-boolean settings', () => {
    expect(defaultConfig().buddy).toHaveProperty('chatEnabled', true)
    expect(buddyConfigSchema.parse({})).toHaveProperty('chatEnabled', true)
    for (const chatEnabled of ['false', null, 0]) {
      expect(buddyConfigSchema.safeParse({ chatEnabled }).success).toBe(false)
    }
  })

  it('adds chat on to version 6 without changing existing settings or mutating the input', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 6,
      buddy: {
        model: 'saved-model',
        anthropicApiKey: 'keep-private',
        motion: 'still',
        tapAction: 'chat'
      }
    }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(7)
    expect(result.config.buddy).toMatchObject({ ...raw.buddy, chatEnabled: true })
    expect(raw).toEqual(before)
    expect(runMigrations(result.config).config).toEqual(result.config)
  })

  it.each([true, false])('preserves an explicit chatEnabled=%s on upgrade', (chatEnabled) => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 6,
      buddy: { ...defaultConfig().buddy, chatEnabled }
    }
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.buddy).toEqual(raw.buddy)
    expect(result.config.schemaVersion).toBe(7)
  })

  it('registers a pure migration that handles absent Buddy settings', () => {
    const migration = migrations.find((m) => m.version === 7)
    expect(migration).toBeDefined()
    expect(migration?.migrate({ schemaVersion: 6 })).toEqual({
      schemaVersion: 7,
      buddy: { chatEnabled: true }
    })
  })
})
