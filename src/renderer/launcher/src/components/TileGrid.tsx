import type { LauncherApi } from '../../../../preload/launcher'
import { useEffect, useState } from 'react'
import type { Tile as TileType } from '@shared/configSchema'
import { HOME_LAYOUTS, tilesInHome, type HomeLayoutName } from '@shared/homeLayout'
import { Tile } from './Tile'

export function TileGrid({
  tiles,
  layout: layoutName,
  onActivate
}: {
  tiles: TileType[]
  layout: HomeLayoutName
  onActivate: (tile: TileType) => void
}) {
  const [images, setImages] = useState<Record<string, string>>({})
  useEffect(() => {
    // Admin's Home preview has no launcher API: its tiles show their icon or artwork instead.
    const launcher = window.launcher as LauncherApi | undefined
    if (!launcher?.getTileImages) return
    let live = true
    let request = 0
    const refresh = (): void => {
      const sequence = ++request
      launcher.getTileImages().then(
        (result) => {
          if (live && sequence === request) setImages(result)
        },
        () => {
          if (live && sequence === request) setImages({})
        }
      )
    }
    refresh()
    const off = launcher.onPhotosChanged(refresh)
    return () => {
      live = false
      off()
    }
  }, [tiles])
  const layout = HOME_LAYOUTS[layoutName]
  const visibleTiles = tilesInHome(layoutName, tiles)

  return (
    <main
      aria-label="Home tiles"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
        overflow: 'hidden',
        gap: layoutName === 'more8' ? 20 : 24,
        padding: '4px 4px 8px'
      }}
    >
      {visibleTiles.map((tile) => (
        <Tile
          key={tile.id}
          tile={tile}
          photoUrl={images[tile.id]}
          slot={tile.slot}
          columns={layout.columns}
          compact
          dense={layoutName === 'more8' && tile.size !== 'wide'}
          onActivate={onActivate}
        />
      ))}
      {visibleTiles.length === 0 && (
        <p
          style={{
            gridColumn: '1 / -1',
            fontSize: 'calc(28px * var(--font-scale, 1))',
            color: 'var(--ink2,#4A4945)'
          }}
        >
          No tiles configured yet - add some from the caregiver admin panel.
        </p>
      )}
    </main>
  )
}
