import type { Tile as TileType } from '@shared/configSchema'
import { Tile } from './Tile'

export function TileGrid({ tiles, onActivate }: { tiles: TileType[]; onActivate: (tile: TileType) => void }) {
  const columns = Math.max(1, Math.min(4, tiles.length))

  return (
    <main
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
        gap: 32,
        padding: '4px 4px 12px'
      }}
    >
      {tiles.map((tile, i) => (
        <Tile key={tile.id} tile={tile} index={i} onActivate={onActivate} />
      ))}
      {tiles.length === 0 && (
        <p style={{ fontSize: 'calc(28px * var(--font-scale, 1))', color: 'var(--ink2,#4A4945)' }}>
          No tiles configured yet - add some from the caregiver admin panel.
        </p>
      )}
    </main>
  )
}
