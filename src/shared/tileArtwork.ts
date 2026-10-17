export const TILE_ARTWORK_KEYS = [
  'photos',
  'music',
  'weather',
  'news',
  'games',
  'websites'
] as const
export type TileArtwork = (typeof TILE_ARTWORK_KEYS)[number]
export const TILE_ARTWORK_LABELS: Record<TileArtwork, string> = {
  photos: 'Photos',
  music: 'Music',
  weather: 'Weather',
  news: 'News',
  games: 'Games',
  websites: 'Websites'
}

/** Presentation is an explicit caregiver choice, never guessed from a tile's label or URL. */
export function tileArtworkFor(tile: {
  type: string
  builtinKey?: string
  artwork?: TileArtwork
  icon?: string
  photoId?: string
}): TileArtwork | undefined {
  if (tile.photoId || tile.icon) return undefined
  if (tile.artwork) return tile.artwork
  const builtin = tile.type === 'builtin' ? tile.builtinKey : undefined
  return builtin &&
    (['photos', 'music', 'weather', 'news', 'games'] as readonly string[]).includes(builtin)
    ? (builtin as TileArtwork)
    : undefined
}
