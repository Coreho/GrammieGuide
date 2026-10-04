import { describe, expect, it } from 'vitest'
import { applyConfigPatch, ConfigValidationError } from '../../src/main/config/applyConfigPatch'
import { defaultConfig, CURRENT_SCHEMA_VERSION, type Config } from '../../src/shared/configSchema'

/**
 * Every config write is validated here, before anything is written (TASK-39).
 * Pure and Electron-free, so this needs no running app.
 *
 * Why it matters enough to test: one unvalidated write costs her everything. The
 * next boot fails runMigrations' validation, falls back to defaultConfig(), and
 * wipes her tiles, the Anthropic key and the PIN hash - after which admin:setPin
 * accepts a new PIN from anyone at the kiosk.
 */
describe('applyConfigPatch', () => {
  const current = defaultConfig()

  it('accepts a valid patch and returns the parsed config', () => {
    const result = applyConfigPatch(current, {
      display: { ...current.display, volumeCeiling: 40 }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.display.volumeCeiling).toBe(40)
  })

  it('throws ConfigValidationError naming only field paths, never values', () => {
    const result = applyConfigPatch(current, {
      display: { ...current.display, volumeCeiling: 5000 }
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(ConfigValidationError)
    expect(result.error.issues.join(' ')).toContain('display.volumeCeiling')
    // No value, and nothing that could be a secret.
    expect(result.error.issues.join(' ')).not.toContain('5000')
    expect(result.error.issues.join(' ')).not.toContain('anthropicApiKey')
    expect(result.error.issues.join(' ')).not.toContain('adminPinHash')
    // The thrown message is the caregiver sentence, not a zod dump.
    expect(result.error.message).toBe(
      'That change could not be saved. Please check the settings and try again.'
    )
  })

  it.each([
    ['an unknown enum value', { display: { ...current.display, theme: 'nope' } }],
    [
      'a zero where a minimum applies',
      { confusion: { ...current.confusion, inactivityTimeoutMinutes: 0 } }
    ],
    ['weather with no locations', { weather: { units: 'metric' } }],
    [
      'an unknown schemaVersion',
      { schemaVersion: (CURRENT_SCHEMA_VERSION + 1) as Config['schemaVersion'] }
    ],
    ['tiles that are not an array', { tiles: 'not-an-array' as unknown as Config['tiles'] }],
    ['an unknown buddy motion', { buddy: { ...current.buddy, motion: 'zoomies' } }],
    ['a wrong-typed boolean', { display: { ...current.display, ambientBackground: 'yes' } }]
  ])('rejects %s', (_label, patch) => {
    expect(applyConfigPatch(current, patch as Partial<Config>).ok).toBe(false)
  })

  it('strips unknown keys and fills defaults on the way to disk', () => {
    const withExtras = {
      ...current,
      somethingFromTheFuture: { nested: true }
    } as unknown as Config
    const result = applyConfigPatch(withExtras, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('somethingFromTheFuture' in result.config).toBe(false)
    const tile = result.config.tiles[0]
    if (tile) expect(tile.size).toBe('normal')
  })

  it('keeps secrets across a patch that does not mention them', () => {
    const withSecrets = {
      ...current,
      buddy: { ...current.buddy, anthropicApiKey: 'sk-test' },
      reliability: { ...current.reliability, adminPinHash: 'hash', adminPinSalt: 'salt' }
    }
    const result = applyConfigPatch(withSecrets, {
      display: { ...current.display, volumeCeiling: 55 }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.buddy.anthropicApiKey).toBe('sk-test')
    expect(result.config.reliability.adminPinHash).toBe('hash')
    expect(result.config.reliability.adminPinSalt).toBe('salt')
  })

  it('merges one level deep, so an untouched section survives', () => {
    const result = applyConfigPatch(current, { tiles: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.weather).toEqual(current.weather)
    expect(result.config.buddy).toEqual(current.buddy)
  })
})
