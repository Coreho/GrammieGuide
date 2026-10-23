import { describe, expect, it } from 'vitest'
import {
  defaultConfig,
  mergeAdminPatch,
  toPublicConfig,
  CURRENT_SCHEMA_VERSION
} from '../../src/shared/configSchema'
import { contactSetupSchema } from '../../src/shared/contactSettings'
import { runMigrations } from '../../src/main/config/migrations/runner'
import { buildConfigBackup, parseConfigBackup } from '../../src/main/services/config/backup'

describe('private contact settings', () => {
  it('migrates version 17 with contact requests off and preserves other settings', () => {
    const old = { ...defaultConfig(), schemaVersion: 17, contacts: undefined }
    old.buddy.anthropicApiKey = 'buddy-secret'
    const result = runMigrations(old)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.contacts.enabled).toBe(false)
    expect(result.config.buddy.anthropicApiKey).toBe('buddy-secret')
  })
  it('strips phones and provider fields from public config and backups, and generic patches cannot change contacts', () => {
    const config = defaultConfig()
    config.contacts.preferred = { id: 'preferred', name: 'Sarah', phone: '+15551111111' }
    config.contacts.credentials = {
      accountSid: `AC${'a'.repeat(32)}`,
      apiKeySid: `SK${'b'.repeat(32)}`,
      apiKeySecret: 'provider-secret',
      sender: '+15552222222'
    }
    const publicJson = JSON.stringify(toPublicConfig(config))
    expect(publicJson).toContain('Sarah')
    for (const secret of [
      '+15551111111',
      '+15552222222',
      'provider-secret',
      config.contacts.credentials.accountSid
    ]) {
      expect(publicJson).not.toContain(secret)
      expect(buildConfigBackup(config)).not.toContain(secret)
    }
    const replacement = {
      ...config.contacts,
      preferred: { id: 'preferred' as const, name: 'Wrong person', phone: '+15553333333' }
    }
    expect(mergeAdminPatch(config, { contacts: replacement }).contacts).toEqual(config.contacts)
    const other = defaultConfig()
    other.contacts = replacement
    expect(parseConfigBackup(buildConfigBackup(other), config).contacts).toEqual(config.contacts)
  })
  it('rejects duplicate numbers, wrong roles and timing that cannot reach fallback before expiry', () => {
    const settings = {
      ...defaultConfig().contacts,
      enabled: true,
      preferred: { id: 'preferred', name: 'Sarah', phone: '+15551111111' }
    }
    expect(contactSetupSchema.safeParse(settings).success).toBe(true)
    expect(
      contactSetupSchema.safeParse({
        ...settings,
        fallback: { ...settings.preferred, id: 'fallback' }
      }).success
    ).toBe(false)
    expect(
      contactSetupSchema.safeParse({ ...settings, fallbackAfterMinutes: settings.expiryMinutes })
        .success
    ).toBe(false)
    expect(contactSetupSchema.safeParse({ ...settings, preferred: null }).success).toBe(false)
  })
})
