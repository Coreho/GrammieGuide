import { extname } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { PHOTO_EXTENSIONS } from '@shared/media/photoTypes'
import { MAX_PATTERN_PAGES, PATTERN_PAGE_EDGE, orderPagePaths } from '@shared/knitting/knitting'
import type { LibraryStore } from '../media/libraryStore'
import { downscale, type PhotoCodec } from '../photos/photoLibrary'

export type PatternLibrary = Pick<LibraryStore, 'addImage' | 'remove' | 'list'>

/**
 * Each picked page goes through the same decode and re-encode as a family photo, so
 * only JPEGs this app wrote are ever served, and never the caregiver's original files.
 */
export async function importPatternPages(
  paths: readonly string[],
  library: PatternLibrary,
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
      if (!PHOTO_EXTENSIONS.some((type) => `.${type}` === extname(source).toLowerCase())) {
        throw new Error('Unsupported page type')
      }
      const decoded = await codec.createFromPath(source)
      if (decoded.isEmpty()) throw new Error('Page could not be decoded')
      const page = downscale(decoded, PATTERN_PAGE_EDGE)
      const jpeg = page.toJPEG(85)
      const thumbnail = downscale(page, 320).toJPEG(85)
      if (!jpeg.length || !thumbnail.length) throw new Error('Page could not be encoded')
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

/** Best effort: an unremoved page is an unused file, never a page she can reach. */
export async function removePatternPages(
  library: PatternLibrary,
  ids: readonly string[]
): Promise<void> {
  for (const id of ids) await library.remove(id).catch(() => undefined)
}
