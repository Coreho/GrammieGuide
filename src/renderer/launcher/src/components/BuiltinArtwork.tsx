import { useState } from 'react'
import type { Tile as TileType } from '@shared/configSchema'
import atlas from '../assets/home-cards/clay-objects-v1.png'
import { builtinFor } from '../tiles/builtins'

const CELLS = {
  photos: [0, 0],
  music: [1, 0],
  weather: [0, 1],
  news: [1, 1]
} as const

/** Caregiver-selected pictures and icons always win over the built-in artwork. */
export function hasBuiltinArtwork(tile: TileType): boolean {
  return Boolean(
    tile.type === 'builtin' &&
    tile.builtinKey &&
    tile.builtinKey in CELLS &&
    !tile.icon &&
    !tile.photoId
  )
}

export function BuiltinArtwork({ tile }: { tile: TileType }) {
  const [failed, setFailed] = useState(false)
  const key = tile.builtinKey as keyof typeof CELLS
  const [column, row] = CELLS[key]

  // One bundled transparent atlas keeps the objects cohesive and works offline.
  // The wrapper exposes one quadrant; labels never become pixels in this image.
  if (failed) return <>{builtinFor(tile)?.icon()}</>
  return (
    <span className="home-card-artwork" aria-hidden="true">
      <img
        src={atlas}
        alt=""
        draggable={false}
        data-builtin-artwork={key}
        onError={() => setFailed(true)}
        style={{ left: `${column * -100}%`, top: `${row * -100}%` }}
      />
    </span>
  )
}
