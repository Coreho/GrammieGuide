import { describe, expect, it } from 'vitest'
import {
  defaultConfig,
  CURRENT_SCHEMA_VERSION,
  toPublicConfig,
  type Config
} from '../../src/shared/configSchema'
import { buildConfigBackup, parseConfigBackup } from '../../src/main/services/config/backup'

function setup(): Config {
  const config = defaultConfig()
  config.tiles = [
    {
      id: 'family',
      label: 'Family',
      type: 'web',
      url: 'https://example.com',
      size: 'wide',
      colorIndex: 3
    },
    {
      id: 'photos',
      label: 'Our photos',
      type: 'builtin',
      builtinKey: 'photos',
      size: 'normal',
      colorIndex: 1
    },
    {
      id: 'music',
      label: 'Her music',
      type: 'builtin',
      builtinKey: 'music',
      size: 'normal',
      colorIndex: 2
    }
  ]
  config.weather.locations = [{ id: 'home', label: 'Boston' }]
  config.display.fontStep = 3
  config.buddy.quickMessages = [{ id: 'hello', text: 'Hello!', clip: 'wave', speak: false }]
  config.buddy.anthropicApiKey = 'source-key'
  config.reliability = { adminPinHash: 'source-hash', adminPinSalt: 'source-salt' }
  return config
}

describe('settings backups', () => {
  it('round trips every setting and tile, including media tiles, without mutating the source', () => {
    const source = setup()
    const before = structuredClone(source)
    const restored = parseConfigBackup(buildConfigBackup(source), defaultConfig())
    expect(toPublicConfig(restored)).toEqual(toPublicConfig(source))
    expect(source).toEqual(before)
    expect(restored.buddy.anthropicApiKey).toBeUndefined()
    expect(restored.reliability.adminPinHash).toBeUndefined()
    expect(restored.reliability.adminPinSalt).toBeUndefined()
  })

  it('never exports API keys, PIN credentials or unsupported contact channel tokens', () => {
    const source = {
      ...setup(),
      contacts: [{ channelToken: 'contact-secret' }],
      buddy: { ...setup().buddy, channelToken: 'nested-secret' }
    }
    const text = buildConfigBackup(source)
    for (const secret of [
      'source-key',
      'source-hash',
      'source-salt',
      'contact-secret',
      'nested-secret',
      'anthropicApiKey',
      'adminPinHash',
      'adminPinSalt',
      'channelToken'
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(JSON.parse(text).notice).toMatch(/photo and music files are not included/i)
  })

  it('keeps only this device’s secrets, even if an incoming backup contains other credentials', () => {
    const device = defaultConfig()
    device.buddy.anthropicApiKey = 'device-key'
    device.reliability = { adminPinHash: 'device-hash', adminPinSalt: 'device-salt' }
    const backup = JSON.parse(buildConfigBackup(setup()))
    backup.config.buddy.anthropicApiKey = 'incoming-key'
    backup.config.reliability.adminPinHash = 'incoming-hash'
    backup.config.reliability.adminPinSalt = 'incoming-salt'
    const restored = parseConfigBackup(JSON.stringify(backup), device)
    expect(restored.buddy.anthropicApiKey).toBe('device-key')
    expect(restored.reliability).toEqual(device.reliability)
    expect(restored.tiles).toEqual(setup().tiles)
  })

  it('upgrades a version-1 backup through all config migrations while keeping saved choices', () => {
    const backup = JSON.parse(buildConfigBackup(setup()))
    backup.config.schemaVersion = 1
    backup.config.tiles = [{ id: 'old', label: 'News', type: 'web', url: 'https://example.com' }]
    backup.config.buddy = {
      model: 'saved-model',
      chattiness: 'low',
      cloudTtsEnabled: false,
      roaming: false
    }
    const restored = parseConfigBackup(JSON.stringify(backup), defaultConfig())
    expect(restored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(restored.tiles[0]).toEqual({ ...backup.config.tiles[0], size: 'normal', colorIndex: 0 })
    expect(restored.buddy).toMatchObject({
      model: 'saved-model',
      motion: 'still',
      tapAction: 'reaction',
      chatEnabled: true,
      voiceEnabled: true,
      quickMessages: []
    })
    expect(restored.display.fontStep).toBe(3)
  })

  it.each(['not JSON', '', 'null', '[]', '{}', JSON.stringify(defaultConfig())])(
    'rejects corrupt or unrelated text %s without changing current config',
    (text) => {
      const device = setup()
      const before = structuredClone(device)
      expect(() => parseConfigBackup(text, device)).toThrow(
        /not a valid GrammieGuide settings backup/i
      )
      expect(device).toEqual(before)
    }
  )

  it.each([
    null,
    {},
    [],
    { schemaVersion: 1 },
    { ...defaultConfig(), tiles: 'bad' },
    { ...defaultConfig(), schemaVersion: '1' },
    { ...defaultConfig(), schemaVersion: -1 }
  ])('rejects invalid backup settings without falling back to defaults: %j', (config) => {
    const backup = JSON.parse(buildConfigBackup(setup()))
    backup.config = config
    const device = setup()
    const before = structuredClone(device)
    expect(() => parseConfigBackup(JSON.stringify(backup), device)).toThrow(
      /not a valid GrammieGuide settings backup/i
    )
    expect(device).toEqual(before)
  })

  it('rejects future backup and config versions in plain words', () => {
    const backup = JSON.parse(buildConfigBackup(setup()))
    backup.config.schemaVersion = CURRENT_SCHEMA_VERSION + 1
    expect(() => parseConfigBackup(JSON.stringify(backup), setup())).toThrow(
      /newer version.*update GrammieGuide/i
    )
    backup.config.schemaVersion = CURRENT_SCHEMA_VERSION
    backup.backupVersion = 2
    expect(() => parseConfigBackup(JSON.stringify(backup), setup())).toThrow(
      /newer version.*update GrammieGuide/i
    )
  })
})
