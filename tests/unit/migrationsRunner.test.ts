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

  it('falls back to defaults (not a crash) when stored config is garbage', () => {
    const result = runMigrations({ schemaVersion: 1, tiles: 'not-an-array' })
    expect(result.ok).toBe(false)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    if (!result.ok) {
      expect(result.corruptBackup).toEqual({ schemaVersion: 1, tiles: 'not-an-array' })
    }
  })
})
