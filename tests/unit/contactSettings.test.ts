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
    old.buddy.ttsVoice = 'buddy-secret'
    const result = runMigrations(old)
    expect(result.ok).toBe(true)
    expect(result.config.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.config.contacts.enabled).toBe(false)
    expect(result.config.buddy.ttsVoice).toBe('buddy-secret')
  })
  it('migrates the saved pair with photos, credentials and callback settings intact', () => {
    const preferred = {
      id: 'preferred',
      name: 'Sarah',
      phone: '+15551111111',
      photoId: '11111111-1111-4111-8111-111111111111'
    }
    const fallback = { id: 'fallback', name: 'Tom', phone: '+15552222222' }
    const credentials = {
      accountSid: `AC${'a'.repeat(32)}`,
      apiKeySid: `SK${'b'.repeat(32)}`,
      apiKeySecret: 'secret',
      sender: '+15550000000'
    }
    for (const second of [fallback, null]) {
      const result = runMigrations({
        ...defaultConfig(),
        schemaVersion: 21,
        contacts: {
          enabled: true,
          preferred,
          fallback: second,
          credentials,
          expiryMinutes: 12,
          fallbackAfterMinutes: 3
        }
      })
      expect(result.ok).toBe(true)
      expect(result.config.contacts).toEqual({
        enabled: true,
        people: [preferred, ...(second ? [second] : [])],
        credentials,
        expiryMinutes: 12,
        fallbackAfterMinutes: 3
      })
    }
  })
  it('limits the list to six unique identities and international numbers', () => {
    const people = Array.from({ length: 6 }, (_, i) => ({
      id: `person-${i}`,
      name: `Person ${i}`,
      phone: `+1555111111${i}`
    }))
    const settings = { ...defaultConfig().contacts, people }
    expect(contactSetupSchema.safeParse(settings).success).toBe(true)
    expect(
      contactSetupSchema.safeParse({
        ...settings,
        people: [...people, { id: 'seventh', name: 'Seven', phone: '+15552222222' }]
      }).success
    ).toBe(false)
    expect(
      contactSetupSchema.safeParse({
        ...settings,
        people: [people[0], { ...people[1], id: people[0]!.id }]
      }).success
    ).toBe(false)
    expect(
      contactSetupSchema.safeParse({ ...settings, people: [{ ...people[0], phone: '5551111111' }] })
        .success
    ).toBe(false)
  })
  it('strips phones and provider fields from public config and backups, and generic patches cannot change contacts', () => {
    const config = defaultConfig()
    config.contacts.people = [{ id: 'preferred', name: 'Sarah', phone: '+15551111111' }]
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
      people: [{ id: 'preferred', name: 'Wrong person', phone: '+15553333333' }]
    }
    expect(mergeAdminPatch(config, { contacts: replacement }).contacts).toEqual(config.contacts)
    const other = defaultConfig()
    other.contacts = replacement
    expect(parseConfigBackup(buildConfigBackup(other), config).contacts).toEqual(config.contacts)
  })
  it('rejects duplicate numbers, duplicate IDs and timing that cannot reach fallback before expiry', () => {
    const settings = {
      ...defaultConfig().contacts,
      enabled: true,
      people: [{ id: 'preferred', name: 'Sarah', phone: '+15551111111' }]
    }
    expect(contactSetupSchema.safeParse(settings).success).toBe(true)
    expect(
      contactSetupSchema.safeParse({
        ...settings,
        people: [...settings.people, { ...settings.people[0], id: 'fallback' }]
      }).success
    ).toBe(false)
    expect(
      contactSetupSchema.safeParse({ ...settings, fallbackAfterMinutes: settings.expiryMinutes })
        .success
    ).toBe(false)
    expect(contactSetupSchema.safeParse({ ...settings, people: [] }).success).toBe(false)
  })
})
