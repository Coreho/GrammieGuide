import { describe, it, expect } from 'vitest'
import { defaultConfig, mergeAdminPatch, toPublicConfig, type Config } from '../../src/shared/configSchema'

function configWithSecrets(): Config {
  const cfg = defaultConfig()
  cfg.buddy.anthropicApiKey = 'sk-ant-secret'
  cfg.reliability.adminPinHash = 'hash'
  cfg.reliability.adminPinSalt = 'salt'
  return cfg
}

describe('mergeAdminPatch', () => {
  it('keeps the API key when the admin saves Buddy settings from PublicConfig', () => {
    const current = configWithSecrets()
    const publicBuddy = toPublicConfig(current).buddy
    const merged = mergeAdminPatch(current, { buddy: { ...publicBuddy, model: 'claude-sonnet-5' } })
    expect(merged.buddy).toMatchObject({ model: 'claude-sonnet-5', anthropicApiKey: 'sk-ant-secret' })
  })

  it('keeps the PIN hash/salt when the admin saves reliability settings', () => {
    const current = configWithSecrets()
    const merged = mergeAdminPatch(current, { reliability: { wifiAdapterName: 'Wi-Fi 2' } })
    expect(merged.reliability).toEqual({ wifiAdapterName: 'Wi-Fi 2', adminPinHash: 'hash', adminPinSalt: 'salt' })
  })

  it('ignores secrets supplied in the patch itself', () => {
    const current = configWithSecrets()
    const merged = mergeAdminPatch(current, {
      buddy: { ...current.buddy, anthropicApiKey: 'attacker-key' },
      reliability: { adminPinHash: 'x', adminPinSalt: 'y' }
    })
    expect(merged.buddy?.anthropicApiKey).toBe('sk-ant-secret')
    expect(merged.reliability).toMatchObject({ adminPinHash: 'hash', adminPinSalt: 'salt' })
  })

  it('leaves unrelated sections untouched', () => {
    const current = configWithSecrets()
    const merged = mergeAdminPatch(current, { tiles: [] })
    expect(merged).toEqual({ tiles: [] })
  })
})
