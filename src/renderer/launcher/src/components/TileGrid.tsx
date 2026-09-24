import type { Tile as TileType } from '@shared/configSchema'
import { Tile } from './Tile'

/**
 * Balanced rows rather than "fill 4 then wrap": 6 tiles as 3+3 reads far
 * better than 4+2. Beyond one row, tiles switch to the compact side-by-side
 * layout - the stacked icon-over-label layout needs ~200px of height and
 * collapses into overlapping pills when two rows share the space.
 */
export function columnsFor(count: number): number {
  if (count <= 4) return Math.max(1, count)
  if (count <= 6) return 3
  return 4
}

export function TileGrid({ tiles, onActivate }: { tiles: TileType[]; onActivate: (tile: TileType) => void }) {
  const columns = columnsFor(tiles.length)
  const compact = tiles.length > columns
  // Four narrow columns can't fit icon + label side by side at large text
  // sizes ("We...", "Pho..."); the words matter more than the icon, so drop it.
  const dense = compact && columns === 4

  return (
    <main
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
        gap: compact ? 24 : 32,
        padding: '4px 4px 12px'
      }}
    >
      {tiles.map((tile, i) => (
        <Tile key={tile.id} tile={tile} index={i} compact={compact} dense={dense} onActivate={onActivate} />
      ))}
      {tiles.length === 0 && (
        <p style={{ fontSize: 'calc(28px * var(--font-scale, 1))', color: 'var(--ink2,#4A4945)' }}>
          No tiles configured yet - add some from the caregiver admin panel.
        </p>
      )}
    </main>
  )
}
