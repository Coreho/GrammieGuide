import type { Photo } from './photoTypes'

/**
 * Albums are a name on each photo, not a list of their own: a photo with no album
 * belongs to her main album, so every photo saved before albums existed stays exactly
 * where it was, and an album with no photos left simply stops existing.
 */
export const MAIN_ALBUM = ''
/** What she sees for the main album. Her own word for it would be better, but nobody has asked her yet. */
export const MAIN_ALBUM_LABEL = 'My photos'
export const PHOTO_ALBUM_MAX = 40

/**
 * The caregiver's album name tidied to one line. Throws on anything that isn't a
 * reasonable name, so main can refuse it before it reaches the library index.
 */
export function tidyAlbumName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid album name')
  // A pasted name may carry line breaks or doubled spaces; she sees it on one line.
  const name = value.replace(/\s+/g, ' ').trim()
  // eslint-disable-next-line no-control-regex
  if (name.length > PHOTO_ALBUM_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Invalid album name')
  }
  return name
}

/** Reading a saved entry never throws: a name this rule no longer accepts means the main album. */
export function savedAlbumName(value: unknown): string {
  try {
    return tidyAlbumName(value)
  } catch {
    return MAIN_ALBUM
  }
}

export interface PhotoAlbum {
  /** The saved name; '' for her main album. */
  name: string
  /** What she reads on the album's card. */
  label: string
  photos: Photo[]
}

export function albumLabel(name: string): string {
  return name === MAIN_ALBUM ? MAIN_ALBUM_LABEL : name
}

/**
 * Groups photos (already in caregiver order) into albums: her main album first, then the
 * others by name, so a new album is added after what she knows instead of in front of it.
 * Names compare case-insensitively, so "New" and "new" are one album.
 */
export function photoAlbums(photos: readonly Photo[]): PhotoAlbum[] {
  const albums = new Map<string, PhotoAlbum>()
  for (const photo of photos) {
    const key = photo.album.toLocaleLowerCase()
    const album = albums.get(key)
    if (album) album.photos.push(photo)
    else albums.set(key, { name: photo.album, label: albumLabel(photo.album), photos: [photo] })
  }
  return [...albums.values()].sort((a, b) => {
    if (a.name === MAIN_ALBUM) return -1
    if (b.name === MAIN_ALBUM) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/** Same comparison as the grouping, so a viewer can find "its" album again after a change. */
export function sameAlbum(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase()
}
