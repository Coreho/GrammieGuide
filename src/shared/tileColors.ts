export const TILE_COLOR_COUNT = 4
export const TILE_COLOR_INDICES = [0, 1, 2, 3] as const

/** Prefer an unused slot; once Home uses every color, reuse the least-used one. */
export function nextTileColor(tiles: readonly { colorIndex?: number }[]): number {
  const counts = TILE_COLOR_INDICES.map(
    (color) => tiles.filter((tile) => tile.colorIndex === color).length
  )
  return counts.indexOf(Math.min(...counts))
}
