import { describe, it, expect } from 'vitest'
import { defaultConfig, mergeAdminPatch, toPublicConfig, type Config } from '../../src/shared/configSchema'

function configWithSecrets(): Config {
  const cfg = defaultConfig()
  cfg.buddy.anthropicApiKey = 'sk-ant-secret'
  cfg.buddy.openrouterApiKey = 'sk-or-secret'
  cfg.reliability.adminPinHash = 'hash'
  cfg.reliability.adminPinSalt = 'salt'
  return cfg
}

describe('mergeAdminPatch', () => {
  it('keeps both API keys when the admin saves Buddy settings from PublicConfig', () => {
    const current = configWithSecrets()
    const publicBuddy = toPublicConfig(current).buddy
    const merged = mergeAdminPatch(current, { buddy: { ...publicBuddy, model: 'claude-sonnet-5' } })
    expect(merged.buddy).toMatchObject({
      model: 'claude-sonnet-5',
      anthropicApiKey: 'sk-ant-secret',
      openrouterApiKey: 'sk-or-secret'
    })
  })

  it('keeps the keys when the admin switches provider and model together', () => {
    const current = configWithSecrets()
    const publicBuddy = toPublicConfig(current).buddy
    const merged = mergeAdminPatch(current, {
      buddy: { ...publicBuddy, provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' }
    })
    expect(merged.buddy).toMatchObject({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-5.5',
      anthropicApiKey: 'sk-ant-secret',
      openrouterApiKey: 'sk-or-secret'
    })
  })

  it('never sends either key to a renderer', () => {
    const serialised = JSON.stringify(toPublicConfig(configWithSecrets()))
    expect(serialised).not.toContain('sk-ant-secret')
    expect(serialised).not.toContain('sk-or-secret')
  })

  it('keeps the PIN hash/salt when the admin saves reliability settings', () => {
    const current = configWithSecrets()
    const merged = mergeAdminPatch(current, { reliability: { wifiAdapterName: 'Wi-Fi 2' } })
    expect(merged.reliability).toEqual({ wifiAdapterName: 'Wi-Fi 2', adminPinHash: 'hash', adminPinSalt: 'salt' })
  })

  it('ignores secrets supplied in the patch itself', () => {
    const current = configWithSecrets()
    const merged = mergeAdminPatch(current, {
      buddy: {
        ...current.buddy,
        anthropicApiKey: 'attacker-key',
        openrouterApiKey: 'attacker-or-key'
      },
      reliability: { adminPinHash: 'x', adminPinSalt: 'y' }
    })
    expect(merged.buddy?.anthropicApiKey).toBe('sk-ant-secret')
    expect(merged.buddy?.openrouterApiKey).toBe('sk-or-secret')
    expect(merged.reliability).toMatchObject({ adminPinHash: 'hash', adminPinSalt: 'salt' })
  })

  it('leaves unrelated sections untouched', () => {
    const current = configWithSecrets()
    const merged = mergeAdminPatch(current, { tiles: [] })
    expect(merged).toEqual({ tiles: [] })
  })
})
