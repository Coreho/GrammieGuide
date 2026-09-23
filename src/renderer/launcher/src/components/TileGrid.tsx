import type { Tile as TileType } from '@shared/configSchema'
import { Tile } from './Tile'

export function TileGrid({ tiles, onActivate }: { tiles: TileType[]; onActivate: (tile: TileType) => void }) {
  const columns = tiles.length > 6 ? 3 : 2

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 24,
        placeItems: 'center',
        padding: 32
      }}
    >
      {tiles.map((tile) => (
        <Tile key={tile.id} tile={tile} onActivate={onActivate} />
      ))}
      {tiles.length === 0 && (
        <p style={{ color: '#fff', fontSize: 'calc(1.2rem * var(--font-scale, 1))' }}>
          No tiles configured yet - add some from the caregiver admin panel.
        </p>
      )}
    </div>
  )
}
