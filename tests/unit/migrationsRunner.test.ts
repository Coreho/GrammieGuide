import { describe, it, expect } from 'vitest'
import { runMigrations } from '../../src/main/config/migrations/runner'
import { defaultConfig, CURRENT_SCHEMA_VERSION } from '../../src/shared/configSchema'

describe('runMigrations', () => {
  it('returns fresh defaults when there is no stored config', () => {
    const result = runMigrations(undefined)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('passes through an already-valid current-version config unchanged', () => {
    const cfg = defaultConfig()
    const result = runMigrations(cfg)
    expect(result.ok).toBe(true)
    expect(result.config).toEqual(cfg)
  })

  it("treats electron-store's empty {} (a fresh install) as first boot, not corruption", () => {
    const result = runMigrations({})
    expect(result.ok).toBe(true)
    expect(result.config).toEqual(defaultConfig())
  })

  it('falls back to defaults (not a crash) when stored config is garbage', () => {
    const result = runMigrations({ schemaVersion: 1, tiles: 'not-an-array' })
    expect(result.ok).toBe(false)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    if (!result.ok) {
      expect(result.corruptBackup).toEqual({ schemaVersion: 1, tiles: 'not-an-array' })
    }
  })
})

describe('migration 002 (Buddy voice + roaming)', () => {
  const v1 = {
    schemaVersion: 1,
    tiles: [{ id: 't1', type: 'web', label: 'News', url: 'https://example.com' }],
    weather: { locations: [{ id: 'l1', label: 'Boston' }], units: 'imperial' },
    confusion: {
      inactivityTimeoutMinutes: 5,
      rapidTap: { count: 20, windowMs: 4000, clusterRadiusPx: 80, cooldownMs: 15000 }
    },
    buddy: { anthropicApiKey: 'sk-ant-keep-me', model: 'claude-haiku-4-5', chattiness: 'low', cloudTtsEnabled: false },
    display: { fontStep: 3, theme: 'tilesBold', ambientBackground: true, volumeCeiling: 60 },
    reliability: { adminPinHash: 'h', adminPinSalt: 's' }
  }

  it('upgrades a v1 config, adding the new Buddy settings and keeping everything else', () => {
    const result = runMigrations(v1)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(2)
    expect(result.config.buddy).toEqual({
      anthropicApiKey: 'sk-ant-keep-me',
      model: 'claude-haiku-4-5',
      chattiness: 'low',
      cloudTtsEnabled: false,
      voiceEnabled: true,
      ttsVoice: 'en-US-AriaNeural',
      roaming: true
    })
    expect(result.config.tiles).toEqual(v1.tiles)
    expect(result.config.reliability).toEqual(v1.reliability)
  })

  it('never overwrites a setting that is already there', () => {
    const result = runMigrations({ ...v1, buddy: { ...v1.buddy, roaming: false, ttsVoice: 'en-US-GuyNeural' } })
    expect(result.ok).toBe(true)
    expect(result.config.buddy.roaming).toBe(false)
    expect(result.config.buddy.ttsVoice).toBe('en-US-GuyNeural')
  })
})
