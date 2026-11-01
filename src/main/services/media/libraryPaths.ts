import { join } from 'node:path'
import type { MediaLibrary } from '@shared/media/mediaPath'

// Shared with import services so files and the protocol cannot drift apart.
export const MEDIA_LIBRARY_FOLDERS: Readonly<Record<MediaLibrary, string>> = {
  music: join('media', 'music'),
  photos: join('media', 'photos'),
  narration: join('media', 'narration'),
  patterns: join('media', 'patterns'),
  knitted: join('media', 'knitted'),
  ravelry: join('media', 'ravelry')
}

export function libraryPaths(
  userData: string,
  library: MediaLibrary
): { folder: string; index: string } {
  const folder = join(userData, MEDIA_LIBRARY_FOLDERS[library])
  return { folder, index: join(folder, 'index.json') }
}
