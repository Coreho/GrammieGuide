import type { Tile as TileType } from '@shared/configSchema'
import { TILE_SHADOW, TILE_SHADOW_ACTIVE, WELL_SHADOW, tileBackground, tileInk } from '../clay'
import { SunCompassIcon, LinkIcon } from '../icons'

function TileIcon({ tile }: { tile: TileType }) {
  if (tile.icon) return <span style={{ fontSize: 32 }}>{tile.icon}</span>
  if (tile.builtinKey === 'weather') return <SunCompassIcon />
  return <LinkIcon />
}

export function Tile({
  tile,
  index,
  onActivate
}: {
  tile: TileType
  index: number
  onActivate: (tile: TileType) => void
}) {
  return (
    <button
      onClick={() => onActivate(tile)}
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '18px 12px',
        border: 'none',
        borderRadius: 40,
        cursor: 'pointer',
        color: tileInk(index),
        background: tileBackground(index),
        boxShadow: TILE_SHADOW,
        transition: 'transform .12s, box-shadow .12s'
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'translateY(3px) scale(.985)'
        e.currentTarget.style.boxShadow = TILE_SHADOW_ACTIVE
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
    >
      <div
        style={{
          width: 'calc(152px - 40px * var(--font-scale, 1))',
          height: 'calc(152px - 40px * var(--font-scale, 1))',
          flex: 'none',
          borderRadius: 34,
          color: 'var(--wi, var(--ai, #1F5A45))',
          background: 'var(--well, linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4)))',
          boxShadow: WELL_SHADOW,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <TileIcon tile={tile} />
      </div>
      <div
        style={{
          fontSize: 'calc(34px * var(--font-scale, 1))',
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.1,
          whiteSpace: 'nowrap'
        }}
      >
        {tile.label}
      </div>
    </button>
  )
}
