import type { Tile as TileType } from '@shared/configSchema'

export function Tile({ tile, onActivate }: { tile: TileType; onActivate: (tile: TileType) => void }) {
  return (
    <button
      onClick={() => onActivate(tile)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: 180,
        minWidth: 180,
        borderRadius: 24,
        border: 'none',
        background: '#3a5f8a',
        color: '#fff',
        fontSize: 'calc(1.1rem * var(--font-scale, 1))',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
      }}
    >
      <span style={{ fontSize: 'calc(2.4rem * var(--font-scale, 1))' }}>{tile.icon ?? '🔷'}</span>
      <span>{tile.label}</span>
    </button>
  )
}
