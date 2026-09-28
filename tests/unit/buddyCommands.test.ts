import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BUDDY_CLIPS, buddyCommandSchema } from '../../src/shared/buddy/commands'
import { defaultConfig } from '../../src/shared/configSchema'
import { runMigrations } from '../../src/main/config/migrations/runner'

describe('Buddy commands', () => {
  it('rejects malformed or empty commands at the IPC boundary', () => {
    for (const input of [
      null,
      {},
      { clip: 'unknown' },
      { text: '   ' },
      { text: 'x'.repeat(301) },
      { speak: true },
      { walk: false },
      { walk: 'yes' },
      { walk: true, clip: 'dance' },
      { walk: true, text: 'Hello' },
      { walk: true, speak: true },
      { clip: 'wave', speak: 'yes' }
    ]) {
      expect(buddyCommandSchema.safeParse(input).success).toBe(false)
    }
    expect(buddyCommandSchema.parse({ walk: true })).toEqual({ walk: true })
    expect(buddyCommandSchema.parse({ text: ' Hi ', clip: 'wave', speak: true })).toEqual({
      text: 'Hi',
      clip: 'wave',
      speak: true
    })
  })

  it('offers exactly the clips baked into the model', () => {
    const glb = readFileSync('src/renderer/launcher/src/buddy/assets/buddy.glb')
    const jsonLength = glb.readUInt32LE(12)
    const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'))
    expect(model.animations.map((a: { name: string }) => a.name).sort()).toEqual(
      [...BUDDY_CLIPS].sort()
    )
  })
})

describe('tile and quick-message migrations', () => {
  it('migrates v2 without mutating it or losing existing settings and secrets', () => {
    const raw = {
      ...defaultConfig(),
      schemaVersion: 2,
      tiles: [{ id: 'web', type: 'web', label: 'Family', url: 'https://example.com' }]
    }
    raw.buddy.anthropicApiKey = 'keep-private'
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.tiles[0]).toMatchObject({ size: 'normal', id: 'web' })
    expect(result.config.buddy.anthropicApiKey).toBe('keep-private')
    expect(result.config.buddy.quickMessages).toEqual([])
    expect(raw).toEqual(before)
  })

  it('preserves wide tiles and saved commands on upgrade and repeated loads', () => {
    const raw = defaultConfig()
    raw.tiles = [
      { id: 'w', label: 'Weather', type: 'builtin', builtinKey: 'weather', size: 'wide' }
    ]
    raw.buddy.quickMessages = [{ id: 'q', text: 'Hello friend', clip: 'wave', speak: false }]
    const result = runMigrations({ ...raw, schemaVersion: 2 })
    expect(result.ok).toBe(true)
    expect(result.config).toEqual(raw)
    expect(runMigrations(result.config).config).toEqual(raw)
  })
})
