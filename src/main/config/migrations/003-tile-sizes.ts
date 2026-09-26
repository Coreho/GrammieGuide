import type { Migration } from './index'

export const migration: Migration = {
  version: 3,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 3,
      tiles: Array.isArray(p.tiles) ? p.tiles.map((tile) => ({ size: 'normal', ...tile })) : p.tiles
    }
  }
}
