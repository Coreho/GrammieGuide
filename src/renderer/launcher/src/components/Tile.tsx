import { useState } from 'react'
import { useLabelFit } from './useLabelFit'
import type { Tile as TileType } from '@shared/configSchema'
import { TILE_SHADOW, TILE_SHADOW_ACTIVE, WELL_SHADOW, tileBackground, tileInk } from '../clay'
import { LinkIcon } from '../icons'
import { builtinFor } from '../tiles/builtins'
import { BuiltinArtwork, hasBuiltinArtwork, artworkAspectFor } from './BuiltinArtwork'
import { tileArtworkFor } from '@shared/tileArtwork'
import './Tile.css'

function TileIcon({ tile }: { tile: TileType }) {
  if (tile.icon) return <span style={{ fontSize: 32 }}>{tile.icon}</span>
  return builtinFor(tile)?.icon() ?? <LinkIcon />
}

function TilePicture({ tile, url }: { tile: TileType; url?: string }) {
  const [failed, setFailed] = useState(false)
  // Keyed by URL below, so a new selection can recover from an earlier missing file.
  return url && !failed ? (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  ) : (
    <TileIcon tile={tile} />
  )
}

export function Tile({
  tile,
  slot,
  columns,
  compact = false,
  dense = false,
  photoUrl,
  onActivate
}: {
  tile: TileType
  slot: number
  columns: number
  /** Icon beside the label instead of above it - used when tiles share the height across rows. */
  compact?: boolean
  /** Label only unless a photo is selected, for the narrowest four-column layout. */
  dense?: boolean
  photoUrl?: string
  onActivate: (tile: TileType) => void
}) {
  const illustrated = !dense && hasBuiltinArtwork(tile)
  const artwork = tileArtworkFor(tile)
  const category = illustrated && (artwork === 'games' || artwork === 'websites')
  // A tile turning wide or dense changes the room its words have.
  const labelRef = useLabelFit(
    tile.label,
    `${tile.size}-${compact}-${dense}-${Boolean(tile.photoId)}-${illustrated}`
  )
  const picturedDense = dense && Boolean(tile.photoId)
  const wellSize = illustrated
    ? {
        height: category
            ? artwork === 'websites'
              ? 'calc(92% - 16px * (var(--font-scale, 1) - 1))'
              : 'calc(100% - 16px * (var(--font-scale, 1) - 1))'
          : 'min(calc(var(--card-art-size, 192px) - 32px * var(--font-scale, 1)), 100%)',
        aspectRatio: artworkAspectFor(tile)
      }
    : dense
      ? { width: 48, height: 48, borderRadius: 16 }
      : compact
        ? {
            height: 'min(calc(112px - 24px * var(--font-scale, 1)), 100%)',
            aspectRatio: '1',
            borderRadius: 28
          }
        : {
            width: 'calc(152px - 40px * var(--font-scale, 1))',
            height: 'calc(152px - 40px * var(--font-scale, 1))',
            borderRadius: 34
          }

  return (
    <button
      className="home-card"
      onClick={() => onActivate(tile)}
      aria-label={tile.label}
      data-tile-slot={slot}
      style={{
        minWidth: 0,
        minHeight: 0,
        height: category ? 'var(--category-card-height, 100%)' : '100%',
        width: '100%',
        maxHeight: '100%',
        aspectRatio: category ? 'var(--category-card-aspect, auto)' : undefined,
        alignSelf: category ? 'var(--category-card-align, stretch)' : undefined,
        overflow: 'hidden',
        gridColumn: `${(slot % columns) + 1} / span ${tile.size === 'wide' ? 2 : 1}`,
        gridRow: Math.floor(slot / columns) + 1,
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: picturedDense
          ? 12
          : category
            ? 'var(--category-card-gap, 24px)'
            : illustrated
              ? 24
              : compact
                ? 22
                : 18,
        padding: picturedDense
          ? '10px 12px'
          : category
            ? 'var(--category-card-padding, 14px 24px)'
            : compact
              ? '14px 24px'
              : '18px 12px',
        border: 'none',
        borderRadius: 40,
        cursor: 'pointer',
        color: tileInk(tile.colorIndex),
        background: tileBackground(tile.colorIndex),
        boxShadow: 'var(--card-shadow, ' + TILE_SHADOW + ')'
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW_ACTIVE
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.boxShadow = 'var(--card-shadow, ' + TILE_SHADOW + ')'
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--card-shadow, ' + TILE_SHADOW + ')'
      }}
      onPointerCancel={(e) => {
        e.currentTarget.style.boxShadow = 'var(--card-shadow, ' + TILE_SHADOW + ')'
      }}
    >
      {(!dense || tile.photoId) && (
        <div
          aria-hidden="true"
          style={{
            ...wellSize,
            overflow: 'hidden',
            flex: 'none',
            color: 'var(--wi, var(--ai, #1F5A45))',
            background: illustrated
              ? undefined
              : 'var(--well, linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4)))',
            boxShadow: illustrated ? undefined : WELL_SHADOW,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {illustrated ? (
            <BuiltinArtwork key={tile.artwork ?? tile.builtinKey} tile={tile} />
          ) : (
            <TilePicture key={photoUrl ?? 'icon'} tile={tile} url={photoUrl} />
          )}
        </div>
      )}
      <div
        ref={labelRef}
        style={{
          fontSize: `calc(${dense ? '29px' : illustrated ? 'var(--card-label-size, 42px)' : '34px'} * var(--font-scale, 1) * var(--label-fit, 1))`,
          fontWeight: illustrated ? 'var(--card-label-weight, 700)' : 700,
          textAlign: compact && !dense ? 'left' : 'center',
          lineHeight: 1.1,
          minWidth: 0,
          flex: illustrated && compact ? '1 1 0' : undefined,
          maxWidth: '100%',
          // Recognition depends on complete words, so never break inside one;
          // useLabelFit shrinks the label instead when a word is too wide.
          overflowWrap: 'normal',
          wordBreak: 'normal'
        }}
      >
        {tile.label}
      </div>
    </button>
  )
}
