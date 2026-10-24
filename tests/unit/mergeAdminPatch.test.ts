import { describe, it, expect } from 'vitest'
import { defaultConfig, mergeAdminPatch, toPublicConfig } from '../../src/shared/configSchema'
describe('mergeAdminPatch', () => {
  it('preserves PIN credentials and rejects incoming secret replacements', () => {
    const current = defaultConfig()
    current.reliability = { adminPinHash: 'hash', adminPinSalt: 'salt' }
    const result = mergeAdminPatch(current, {
      reliability: { adminPinHash: 'incoming', adminPinSalt: 'incoming', wifiAdapterName: 'Wi-Fi' }
    })
    expect(result.reliability).toEqual({
      adminPinHash: 'hash',
      adminPinSalt: 'salt',
      wifiAdapterName: 'Wi-Fi'
    })
  })
  it('drops obsolete provider credentials from public config and patches', () => {
    const current = defaultConfig()
    const buddy = { ...current.buddy, anthropicApiKey: 'old-ant', openrouterApiKey: 'old-or' }
    const result = mergeAdminPatch(current, { buddy })
    expect(result.buddy).toEqual(current.buddy)
    expect(toPublicConfig({ ...current, buddy }).buddy).toEqual(current.buddy)
  })
  it('saves ChatGPT models without changing unrelated sections', () => {
    const current = defaultConfig()
    expect(
      mergeAdminPatch(current, { buddy: { ...current.buddy, model: 'account-model' } })
    ).toEqual({ buddy: { ...current.buddy, model: 'account-model' } })
    expect(mergeAdminPatch(current, { tiles: [] })).toEqual({ tiles: [] })
  })
})
