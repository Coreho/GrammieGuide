import { useLayoutEffect, useRef, useState } from 'react'
import type { Tile as TileType } from '@shared/configSchema'
import { TILE_SHADOW, TILE_SHADOW_ACTIVE, WELL_SHADOW, tileBackground, tileInk } from '../clay'
import { LinkIcon } from '../icons'
import { builtinFor } from '../tiles/builtins'

/** Smallest share of her chosen text size a label may shrink to before it is left to clip. */
const MIN_LABEL_FIT = 0.6

/**
 * Shrinks one label just enough that its whole words fit the tile. Rows are
 * fixed now, so a long word at the largest text size used to break mid-word
 * ("Grandchildre / n") or lose its last line. Most labels keep fit 1; the
 * caregiver's text size is only trimmed where a word cannot otherwise fit.
 * Writes a CSS variable rather than React state so measuring never re-renders.
 */
function useLabelFit(label: string, shape: string) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const text = ref.current
    const button = text?.parentElement
    if (!text || !button) return
    const overflowing = (): boolean =>
      text.scrollWidth > text.clientWidth + 1 ||
      button.scrollWidth > button.clientWidth + 1 ||
      button.scrollHeight > button.clientHeight + 1
    const fit = (): void => {
      let scale = 1
      text.style.setProperty('--label-fit', '1')
      while (scale > MIN_LABEL_FIT && overflowing()) {
        scale = Math.round((scale - 0.04) * 100) / 100
        text.style.setProperty('--label-fit', String(scale))
      }
    }
    fit()
    // The label resizes when her text size or the web font changes. Re-fitting
    // on the next frame, outside the observer callback, avoids Chromium's
    // "ResizeObserver loop" error; the second pass finds the same fit and stops.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(text)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [label, shape])
  return ref
}

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
  // A tile turning wide or dense changes the room its words have.
  const labelRef = useLabelFit(
    tile.label,
    `${tile.size}-${compact}-${dense}-${Boolean(tile.photoId)}`
  )
  const picturedDense = dense && Boolean(tile.photoId)
  const wellSize = dense
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
      onClick={() => onActivate(tile)}
      aria-label={tile.label}
      data-tile-slot={slot}
      style={{
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        gridColumn: `${(slot % columns) + 1} / span ${tile.size === 'wide' ? 2 : 1}`,
        gridRow: Math.floor(slot / columns) + 1,
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: picturedDense ? 12 : compact ? 22 : 18,
        padding: picturedDense ? '10px 12px' : compact ? '14px 24px' : '18px 12px',
        border: 'none',
        borderRadius: 40,
        cursor: 'pointer',
        color: tileInk(tile.colorIndex),
        background: tileBackground(tile.colorIndex),
        boxShadow: TILE_SHADOW,
        transition: 'translate .14s, scale .14s, box-shadow .12s'
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW_ACTIVE
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
    >
      {(!dense || tile.photoId) && (
        <div
          style={{
            ...wellSize,
            overflow: 'hidden',
            flex: 'none',
            color: 'var(--wi, var(--ai, #1F5A45))',
            background:
              'var(--well, linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4)))',
            boxShadow: WELL_SHADOW,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <TilePicture key={photoUrl ?? 'icon'} tile={tile} url={photoUrl} />
        </div>
      )}
      <div
        ref={labelRef}
        style={{
          fontSize: `calc(${dense ? 29 : 34}px * var(--font-scale, 1) * var(--label-fit, 1))`,
          fontWeight: 700,
          textAlign: compact && !dense ? 'left' : 'center',
          lineHeight: 1.1,
          minWidth: 0,
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
