import type { Tile as TileType } from '@shared/configSchema'
import { TileGrid } from './TileGrid'

export function HomeView({
  tiles,
  onActivate,
  onHelp
}: {
  tiles: TileType[]
  onActivate: (tile: TileType) => void
  onHelp: () => void
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TileGrid tiles={tiles} onActivate={onActivate} />
      </div>
      <button
        onClick={onHelp}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          fontSize: 'calc(1.2rem * var(--font-scale, 1))',
          padding: '18px 28px',
          borderRadius: 20,
          border: '3px solid #fff',
          background: '#c0392b',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer'
        }}
      >
        Help
      </button>
    </div>
  )
}
