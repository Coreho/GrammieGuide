import {
  chooseLayoutForTiles,
  placeTilesInOrder,
  type SlottedTile,
  type TileSize
} from '@shared/homeLayout'
import type { Migration } from './index'

function migrationTile(value: unknown, index: number): SlottedTile & Record<string, unknown> {
  const tile = (value ?? {}) as Record<string, unknown>
  return {
    ...tile,
    id: typeof tile.id === 'string' ? tile.id : `migrated-${index}`,
    size: tile.size === 'wide' ? 'wide' : ('normal' as TileSize)
  }
}

export const migration: Migration = {
  version: 8,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    const display = (p.display ?? {}) as Record<string, unknown>
    const tiles = Array.isArray(p.tiles) ? p.tiles.map(migrationTile) : p.tiles
    const homeLayout = chooseLayoutForTiles(Array.isArray(tiles) ? tiles : [])
    return {
      ...p,
      schemaVersion: 8,
      display: { homeLayout, ...display },
      tiles: Array.isArray(tiles) ? placeTilesInOrder(homeLayout, tiles) : tiles
    }
  }
}
