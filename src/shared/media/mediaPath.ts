export const MEDIA_SCHEME = 'grammie-media'
export const MEDIA_LIBRARIES = ['music', 'photos'] as const
export type MediaLibrary = (typeof MEDIA_LIBRARIES)[number]

export interface MediaPath {
  library: MediaLibrary
  fileName: string
}

export function isMediaLibrary(value: string): value is MediaLibrary {
  return MEDIA_LIBRARIES.some((library) => library === value)
}

export function isSafeMediaFileName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 255 &&
    !/[^A-Za-z0-9._-]/.test(value) &&
    !value.includes('..') &&
    !value.endsWith('.') &&
    // Windows treats device names specially even when they have an extension.
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
  )
}

export function parseMediaUrl(value: string): MediaPath | null {
  // Inspect the original path: URL parsing can normalize away traversal segments.
  const match = /^grammie-media:\/\/([^/]+)\/([^?#]*)$/.exec(value)
  if (!match || !isMediaLibrary(match[1]!)) return null
  try {
    const fileName = decodeURIComponent(match[2]!)
    if (!isSafeMediaFileName(fileName)) return null
    return { library: match[1]!, fileName }
  } catch {
    return null
  }
}
