import { describe, expect, it } from 'vitest'
import { nextTileColor } from '../../src/shared/tileColors'
import { defaultConfig, tileSchema } from '../../src/shared/configSchema'
import { runMigrations } from '../../src/main/config/migrations/runner'
import { migration } from '../../src/main/config/migrations/005-tile-colors'
import { tileBackground, tileInk } from '../../src/renderer/launcher/src/clay'

const oldTiles = Array.from({ length: 7 }, (_, index) => ({
  id: String(index),
  type: 'web',
  label: String(index),
  size: index === 1 ? 'wide' : 'normal'
}))

describe('permanent tile colors', () => {
  it('migrates the old position colors exactly, including wide tiles and palette wraparound', () => {
    const raw = { ...defaultConfig(), schemaVersion: 4, tiles: oldTiles }
    const before = structuredClone(raw)
    const result = runMigrations(raw)
    expect(result.ok).toBe(true)
    expect(result.config.tiles.map((tile) => tile.colorIndex)).toEqual([0, 1, 2, 3, 0, 1, 2])
    result.config.tiles.forEach((tile, index) => {
      expect(tileBackground(tile.colorIndex)).toBe(tileBackground(index))
      expect(tileInk(tile.colorIndex)).toBe(tileInk(index))
    })
    expect(raw).toEqual(before)
    expect(runMigrations(result.config).config).toEqual(result.config)
  })

  it('preserves existing colors and other values without mutating the input', () => {
    const raw = { schemaVersion: 4, tiles: [{ ...oldTiles[0], colorIndex: 3 }] }
    const before = structuredClone(raw)
    expect(migration.migrate(raw)).toEqual({ ...raw, schemaVersion: 5 })
    expect(raw).toEqual(before)
  })

  it('handles empty Home and lets the runner reject malformed stored colors', () => {
    expect(runMigrations({ ...defaultConfig(), schemaVersion: 4 }).ok).toBe(true)
    for (const colorIndex of [-1, 4, 1.5, '1', null]) {
      const raw = { ...defaultConfig(), schemaVersion: 4, tiles: [{ ...oldTiles[0], colorIndex }] }
      expect(runMigrations(raw)).toMatchObject({ ok: false, corruptBackup: raw })
    }
  })

  it('requires a valid palette index in current configs', () => {
    expect(tileSchema.safeParse(oldTiles[0]).success).toBe(false)
    for (const colorIndex of [0, 1, 2, 3]) {
      expect(tileSchema.safeParse({ ...oldTiles[0], colorIndex }).success).toBe(true)
    }
  })

  it('uses an available color after removal and reuses the least-used color when full', () => {
    expect(nextTileColor([])).toBe(0)
    expect(nextTileColor([{ colorIndex: 0 }, { colorIndex: 2 }, { colorIndex: 3 }])).toBe(1)
    expect(nextTileColor([0, 1, 2, 3, 0].map((colorIndex) => ({ colorIndex })))).toBe(1)
  })
})
