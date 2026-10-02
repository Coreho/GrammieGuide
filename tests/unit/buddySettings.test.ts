import { describe, expect, it } from 'vitest'
import { buddyConfigSchema, defaultConfig, CURRENT_SCHEMA_VERSION } from '../../src/shared/configSchema'
import { migration } from '../../src/main/config/migrations/006-buddy-interaction-settings'
import { runMigrations } from '../../src/main/config/migrations/runner'

describe('Buddy settings schema', () => {
  it('keeps the existing tap and motion behavior by default', () => {
    expect(buddyConfigSchema.parse({})).toMatchObject({ motion: 'roam', tapAction: 'reaction' })
    expect(defaultConfig().buddy).toMatchObject({ motion: 'roam', tapAction: 'reaction' })
    expect(defaultConfig().buddy).not.toHaveProperty('roaming')
  })

  it('accepts every motion and tap choice', () => {
    for (const motion of ['still', 'roam', 'reduced']) {
      for (const tapAction of ['reaction', 'chat']) {
        expect(buddyConfigSchema.parse({ motion, tapAction })).toMatchObject({ motion, tapAction })
      }
    }
  })

  it('rejects invalid choices instead of silently changing behavior', () => {
    for (const value of ['unknown', '', false, null]) {
      expect(buddyConfigSchema.safeParse({ motion: value }).success).toBe(false)
      expect(buddyConfigSchema.safeParse({ tapAction: value }).success).toBe(false)
    }
  })
})

describe('migration 006 (Buddy interaction settings)', () => {
  it.each([
    [true, 'roam'],
    [false, 'still'],
    [undefined, 'roam']
  ])('maps old roaming %s to %s and removes the old key', (roaming, motion) => {
    const { motion: _motion, tapAction: _tapAction, ...buddy } = defaultConfig().buddy
    const raw = { ...defaultConfig(), schemaVersion: 5, buddy: { ...buddy, roaming } }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.buddy).toEqual({ ...buddy, motion, tapAction: 'reaction' })
    expect(raw).toEqual(before)
    expect(runMigrations(result.config).config).toEqual(result.config)
  })

  it('supplies defaults when the Buddy settings are absent', () => {
    expect(migration.migrate({ schemaVersion: 5 })).toEqual({
      schemaVersion: 6,
      buddy: { motion: 'roam', tapAction: 'reaction' }
    })
  })

  it.each(['still', 'roam', 'reduced'] as const)(
    'preserves an existing %s choice and chat action',
    (motion) => {
      const buddy = {
        ...defaultConfig().buddy,
        motion,
        tapAction: 'chat' as const,
        anthropicApiKey: 'keep-me'
      }
      const raw = {
        ...defaultConfig(),
        schemaVersion: 5,
        buddy: { ...buddy, roaming: motion !== 'roam' }
      }
      const before = structuredClone(raw)
      const result = runMigrations(raw)
      expect(result.ok).toBe(true)
      expect(result.config.buddy).toEqual(buddy)
      expect(raw).toEqual(before)
    }
  )

  it('leaves invalid explicit settings for the runner to reject', () => {
    const raw = { ...defaultConfig(), schemaVersion: 5, buddy: { motion: 'invalid' } }
    expect(runMigrations(raw)).toMatchObject({ ok: false, corruptBackup: raw })
  })
})
