import { describe, expect, it } from 'vitest'
import {
  buddyConfigSchema,
  CURRENT_SCHEMA_VERSION,
  defaultConfig,
  idleDimConfigSchema
} from '../../src/shared/configSchema'
import { migrations } from '../../src/main/config/migrations'
import { runMigrations } from '../../src/main/config/migrations/runner'

describe('ChatGPT provider migration 019', () => {
  it('versions the new provider without changing the saved provider, model or keys', () => {
    const previous = {
      ...defaultConfig(),
      schemaVersion: 18,
      buddy: {
        ...defaultConfig().buddy,
        provider: 'openrouter',
        model: 'saved-model',
        openrouterApiKey: 'keep-private'
      }
    }
    const before = structuredClone(previous)
    const result = runMigrations(previous)
    expect(CURRENT_SCHEMA_VERSION).toBe(19)
    expect(result.ok).toBe(true)
    expect(result.config.buddy).toEqual(previous.buddy)
    expect(previous).toEqual(before)
    expect(runMigrations(result.config).config).toEqual(result.config)
  })
})

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
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
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
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
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

describe('fixed Home layout migration 008', () => {
  it('selects a layout, assigns slots in saved order, preserves wide adjacency, and keeps overflow', () => {
    const migration = migrations.find((candidate) => candidate.version === 8)!
    const raw = {
      schemaVersion: 7,
      display: { theme: 'tilesBold' },
      tiles: [
        { id: 'wide', size: 'wide' },
        { id: 'a', size: 'normal' },
        { id: 'b', size: 'normal' },
        { id: 'c', size: 'normal' },
        { id: 'd', size: 'normal' },
        { id: 'e', size: 'normal' },
        { id: 'overflow', size: 'wide' }
      ]
    }
    const before = structuredClone(raw)
    const migrated = migration.migrate(raw) as {
      schemaVersion: number
      display: { homeLayout: string }
      tiles: Array<{ id: string; slot: number | null }>
    }

    expect(migrated.schemaVersion).toBe(8)
    expect(migrated.display.homeLayout).toBe('more8')
    expect(migrated.tiles.map(({ id, slot }) => ({ id, slot }))).toEqual([
      { id: 'wide', slot: 0 },
      { id: 'a', slot: 2 },
      { id: 'b', slot: 3 },
      { id: 'c', slot: 4 },
      { id: 'd', slot: 5 },
      { id: 'e', slot: 6 },
      { id: 'overflow', slot: null }
    ])
    expect(raw).toEqual(before)
  })

  it('uses Simple four when the saved tiles consume no more than four spaces', () => {
    const migration = migrations.find((candidate) => candidate.version === 8)!
    const migrated = migration.migrate({
      schemaVersion: 7,
      display: {},
      tiles: [
        { id: 'wide', size: 'wide' },
        { id: 'normal', size: 'normal' }
      ]
    }) as { display: { homeLayout: string }; tiles: Array<{ slot: number | null }> }
    expect(migrated.display.homeLayout).toBe('simple4')
    expect(migrated.tiles.map(({ slot }) => slot)).toEqual([0, 2])
  })
})

describe('idle dimming setting and migration 013', () => {
  it('disables idle dimming by default and bounds minutes (2-60) and level (0.1-0.5)', () => {
    expect(defaultConfig().display.idleDim).toEqual({
      enabled: false,
      afterMinutes: 10,
      level: 0.3
    })
    expect(idleDimConfigSchema.parse({})).toEqual({
      enabled: false,
      afterMinutes: 10,
      level: 0.3
    })
    // Invalid boundaries
    expect(idleDimConfigSchema.safeParse({ afterMinutes: 1 }).success).toBe(false)
    expect(idleDimConfigSchema.safeParse({ afterMinutes: 61 }).success).toBe(false)
    expect(idleDimConfigSchema.safeParse({ afterMinutes: 10.5 }).success).toBe(false)
    expect(idleDimConfigSchema.safeParse({ level: 0.05 }).success).toBe(false)
    expect(idleDimConfigSchema.safeParse({ level: 0.55 }).success).toBe(false)
    expect(idleDimConfigSchema.safeParse({ enabled: 'true' }).success).toBe(false)
  })

  it('migrates a version 12 config to version 13, adding idleDim off without mutating input', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 12,
      display: {
        fontStep: 2,
        theme: 'tilesBold',
        homeLayout: 'simple4',
        ambientBackground: true,
        volumeCeiling: 70
      }
    }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.display.idleDim).toEqual({
      enabled: false,
      afterMinutes: 10,
      level: 0.3
    })
    expect(raw).toEqual(before)
    expect(runMigrations(result.config).config).toEqual(result.config)
  })

  it('preserves explicit existing idleDim settings on upgrade', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 12,
      display: {
        ...defaultConfig().display,
        idleDim: {
          enabled: true,
          afterMinutes: 20,
          level: 0.4
        }
      }
    }
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.display.idleDim).toEqual({
      enabled: true,
      afterMinutes: 20,
      level: 0.4
    })
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('registers a pure migration that handles absent display settings', () => {
    const migration = migrations.find((m) => m.version === 13)
    expect(migration).toBeDefined()
    expect(migration?.migrate({ schemaVersion: 12 })).toEqual({
      schemaVersion: 13,
      display: {
        idleDim: {
          enabled: false,
          afterMinutes: 10,
          level: 0.3
        }
      }
    })
  })
})
