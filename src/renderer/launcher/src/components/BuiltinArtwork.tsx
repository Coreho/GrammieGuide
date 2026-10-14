import { useState } from 'react'
import type { Tile as TileType } from '@shared/configSchema'
import atlas from '../assets/home-cards/clay-objects-v1.png'
import extraAtlas from '../assets/home-cards/games-websites-objects-v1.png'
import { builtinFor } from '../tiles/builtins'
import { tileArtworkFor } from '@shared/tileArtwork'
import { LinkIcon } from '../icons'

const CELLS = {
  photos: [0, 0],
  music: [1, 0],
  weather: [0, 1],
  news: [1, 1]
} as const

// Measured alpha bounds (128 threshold, 8px breathing room) of the approved atlas.
// Fit visible objects, not transparent production padding.
const FRAMES = {
  games: { left: 88, top: 176, width: 756, height: 636 },
  websites: { left: 92, top: 1055, width: 712, height: 548 }
} as const

export function artworkAspectFor(tile: TileType): number {
  const key = tileArtworkFor(tile)
  if (key !== 'games' && key !== 'websites') return 1
  const frame = FRAMES[key]
  return frame.width / frame.height
}

/** Caregiver-selected pictures and icons always win over the built-in artwork. */
export function hasBuiltinArtwork(tile: TileType): boolean {
  return Boolean(tileArtworkFor(tile))
}

export function BuiltinArtwork({ tile }: { tile: TileType }) {
  const [failed, setFailed] = useState(false)
  const key = tileArtworkFor(tile)!
  const extra = key === 'games' || key === 'websites'
  const frame = extra ? FRAMES[key] : undefined
  const [column, row] = extra ? [0, key === 'games' ? 0 : 1] : CELLS[key]

  // One bundled transparent atlas keeps the objects cohesive and works offline.
  // The wrapper exposes one quadrant; labels never become pixels in this image.
  if (failed) return <>{builtinFor(tile)?.icon() ?? <LinkIcon />}</>
  return (
    <span className="home-card-artwork" aria-hidden="true">
      <img
        src={extra ? extraAtlas : atlas}
        alt=""
        draggable={false}
        data-builtin-artwork={key}
        onError={() => setFailed(true)}
        style={
          frame
            ? {
                left: `${(-frame.left / frame.width) * 100}%`,
                top: `${(-frame.top / frame.height) * 100}%`,
                width: `${(887 / frame.width) * 100}%`,
                height: `${(1774 / frame.height) * 100}%`
              }
            : { left: `${column * -100}%`, top: `${row * -100}%` }
        }
      />
    </span>
  )
}
