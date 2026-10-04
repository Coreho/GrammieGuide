import { describe, expect, it } from 'vitest'
import {
  browserConfigSchema,
  buddyConfigSchema,
  defaultConfig,
  CURRENT_SCHEMA_VERSION
} from '../../src/shared/configSchema'
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
    // Not 7: later migrations may exist, and this test is about the chat setting
    // surviving the upgrade, not about being the last one.
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

describe('approved sites and migration 008', () => {
  it('starts with no extra approved sites', () => {
    expect(defaultConfig().browser.approvedSites).toEqual([])
    expect(browserConfigSchema.parse({}).approvedSites).toEqual([])
  })

  it('rejects a host list that is not a bounded list of host strings', () => {
    expect(browserConfigSchema.safeParse({ approvedSites: 'example.com' }).success).toBe(false)
    expect(browserConfigSchema.safeParse({ approvedSites: [''] }).success).toBe(false)
    expect(browserConfigSchema.safeParse({ approvedSites: ['a'.repeat(254)] }).success).toBe(false)
  })

  it('adds the section to version 7 without changing anything else', () => {
    const raw = { ...defaultConfig(), schemaVersion: 7, tiles: [] }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(8)
    // Empty on purpose: her tiles are their own approval, so nothing changes for
    // her on upgrade.
    expect(result.config.browser.approvedSites).toEqual([])
    expect(result.config.tiles).toEqual([])
    expect(raw).toEqual(before)
  })

  it('registers a pure migration that handles an absent and a partial browser section', () => {
    const migration = migrations.find((m) => m.version === 8)
    expect(migration).toBeDefined()
    expect(migration?.migrate({ schemaVersion: 7 })).toEqual({
      schemaVersion: 8,
      browser: { approvedSites: [] }
    })
    // A section that already exists is kept, so a re-run never wipes a choice.
    expect(
      migration?.migrate({ schemaVersion: 7, browser: { approvedSites: ['example.com'] } })
    ).toEqual({ schemaVersion: 8, browser: { approvedSites: ['example.com'] } })
  })

  it('keeps approvals a caregiver has already made', () => {
    const raw = { ...defaultConfig(), schemaVersion: 7, browser: { approvedSites: ['example.com'] } }
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.browser.approvedSites).toEqual(['example.com'])
  })
})