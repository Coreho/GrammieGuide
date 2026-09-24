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
  compact = false,
  dense = false,
  onActivate
}: {
  tile: TileType
  index: number
  /** Icon beside the label instead of above it - used when tiles share the height across rows. */
  compact?: boolean
  /** Label only, no icon - for the narrowest (4-column, multi-row) layout. */
  dense?: boolean
  onActivate: (tile: TileType) => void
}) {
  const wellSize = compact
    ? { height: 'min(calc(112px - 24px * var(--font-scale, 1)), 100%)', aspectRatio: '1', borderRadius: 28 }
    : {
        width: 'calc(152px - 40px * var(--font-scale, 1))',
        height: 'calc(152px - 40px * var(--font-scale, 1))',
        borderRadius: 34
      }

  return (
    <button
      onClick={() => onActivate(tile)}
      aria-label={tile.label}
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 22 : 18,
        padding: compact ? '14px 24px' : '18px 12px',
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
      {!dense && (
        <div
          style={{
            ...wellSize,
            flex: 'none',
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
      )}
      <div
        style={{
          fontSize: 'calc(34px * var(--font-scale, 1))',
          fontWeight: 700,
          textAlign: compact && !dense ? 'left' : 'center',
          lineHeight: 1.1,
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          // Wrap whole words onto a second line before ever truncating -
          // a clipped "Pho..." is much harder to recognise than a wrapped label.
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflowWrap: 'normal',
          wordBreak: 'normal'
        }}
      >
        {tile.label}
      </div>
    </button>
  )
}
