import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'
import type { Config } from '../../src/shared/configSchema'

let mockConfig: Config

vi.mock('../../src/main/config/store', () => ({
  getConfig: () => mockConfig,
  setConfig: (patch: Partial<Config>) => {
    mockConfig = { ...mockConfig, ...patch }
    return mockConfig
  }
}))

describe('adminAuth', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockConfig = defaultConfig()
  })

  it('reports no PIN set initially, then set/verify round-trips', async () => {
    const auth = await import('../../src/main/services/auth/adminAuth')
    expect(auth.isPinSet()).toBe(false)

    const setResult = auth.setPin('1234')
    expect(setResult.ok).toBe(true)
    expect(auth.isPinSet()).toBe(true)

    expect(auth.verifyPin('1234').ok).toBe(true)
    expect(auth.verifyPin('9999').ok).toBe(false)
  })

  it('rejects a non-numeric or too-short PIN', async () => {
    const auth = await import('../../src/main/services/auth/adminAuth')
    expect(auth.setPin('abcd').ok).toBe(false)
    expect(auth.setPin('12').ok).toBe(false)
  })

  it('requires the current PIN to change an existing one', async () => {
    const auth = await import('../../src/main/services/auth/adminAuth')
    auth.setPin('1234')
    expect(auth.setPin('5678', 'wrong').ok).toBe(false)
    expect(auth.setPin('5678', '1234').ok).toBe(true)
    expect(auth.verifyPin('5678').ok).toBe(true)
  })

  it('locks out after repeated failed attempts', async () => {
    const auth = await import('../../src/main/services/auth/adminAuth')
    auth.setPin('1234')
    for (let i = 0; i < 5; i++) auth.verifyPin('0000')
    const result = auth.verifyPin('1234')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('too many attempts')
  })

  it('unlockAdmin flips isAdminUnlocked only on correct PIN', async () => {
    const auth = await import('../../src/main/services/auth/adminAuth')
    auth.setPin('1234')
    expect(auth.isAdminUnlocked()).toBe(false)
    auth.unlockAdmin('0000')
    expect(auth.isAdminUnlocked()).toBe(false)
    auth.unlockAdmin('1234')
    expect(auth.isAdminUnlocked()).toBe(true)
    auth.lockAdmin()
    expect(auth.isAdminUnlocked()).toBe(false)
  })
})
