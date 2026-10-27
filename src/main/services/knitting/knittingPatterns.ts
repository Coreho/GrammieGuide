import { setImmediate } from 'node:timers/promises'
import { MAX_PATTERN_PAGES, PATTERN_PAGE_EDGE, orderPagePaths } from '@shared/knitting/knitting'
import type { PhotoCodec } from '../photos/photoLibrary'
import { encodePicture, type KnittingLibrary } from './knittingPictures'

/** Pages are added in file-name order; one unreadable page is counted and skipped. */
export async function importPatternPages(
  paths: readonly string[],
  library: KnittingLibrary,
  codec: PhotoCodec,
  patternId: string
): Promise<{ pages: string[]; failed: number }> {
  if (paths.length > MAX_PATTERN_PAGES) {
    throw new Error(`Choose up to ${MAX_PATTERN_PAGES} pages at a time.`)
  }
  const pages: string[] = []
  let failed = 0
  for (const source of orderPagePaths(paths)) {
    try {
      const { jpeg, thumbnail } = await encodePicture(source, codec, PATTERN_PAGE_EDGE)
      pages.push((await library.addImage(jpeg, thumbnail, { patternId })).id)
    } catch {
      // One unreadable page affects only itself; its name or path never goes back to admin.
      failed += 1
    }
    // Native decoding is synchronous; let IPC breathe between pages.
    await setImmediate()
  }
  return { pages, failed }
}
