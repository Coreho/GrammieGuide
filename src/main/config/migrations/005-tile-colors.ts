import type { Migration } from './index'

export const migration: Migration = {
  version: 5,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 5,
      // Freeze the old four-slot cycle so upgrading never repaints Home.
      tiles: Array.isArray(p.tiles)
        ? p.tiles.map((tile, index) => ({ colorIndex: index % 4, ...tile }))
        : p.tiles
    }
  }
}
