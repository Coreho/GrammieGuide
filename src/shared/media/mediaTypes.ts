import type { MediaLibrary } from './mediaPath'

/** Import and picker types must stay aligned with what grammie-media can serve. */
export const LIBRARY_CONTENT_TYPES: Readonly<
  Record<MediaLibrary, Readonly<Record<string, string>>>
> = {
  photos: {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon'
  },
  music: {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm'
  }
}

/** Electron's picker expects extensions without leading dots. */
export const LIBRARY_EXTENSIONS: Readonly<Record<MediaLibrary, readonly string[]>> = {
  photos: Object.keys(LIBRARY_CONTENT_TYPES.photos).map((extension) => extension.slice(1)),
  music: Object.keys(LIBRARY_CONTENT_TYPES.music).map((extension) => extension.slice(1))
}

// The protocol also serves photo narration audio; only imports are restricted per library.
export const MEDIA_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ...LIBRARY_CONTENT_TYPES.photos,
  ...LIBRARY_CONTENT_TYPES.music
}

export function isLibraryMediaExtension(library: MediaLibrary, extension: string): boolean {
  return Object.hasOwn(LIBRARY_CONTENT_TYPES[library], extension.toLowerCase())
}
