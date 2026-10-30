import { extname } from 'node:path'
import { PHOTO_EXTENSIONS } from '@shared/media/photoTypes'
import type { LibraryStore } from '../media/libraryStore'
import { downscale, type PhotoCodec } from '../photos/photoLibrary'

/** The parts of a media library the knitting pictures (pattern pages, finished pieces) use. */
export type KnittingLibrary = Pick<LibraryStore, 'addImage' | 'remove' | 'list'>

/**
 * Each picked picture goes through the same decode and re-encode as a family photo, so
 * only JPEGs this app wrote are ever served, and never the caregiver's original files.
 */
export async function encodePicture(
  source: string,
  codec: PhotoCodec,
  edge: number
): Promise<{ jpeg: Buffer; thumbnail: Buffer }> {
  if (!PHOTO_EXTENSIONS.some((type) => `.${type}` === extname(source).toLowerCase())) {
    throw new Error('Unsupported picture type')
  }
  const decoded = await codec.createFromPath(source)
  if (decoded.isEmpty()) throw new Error('Picture could not be decoded')
  const picture = downscale(decoded, edge)
  const jpeg = picture.toJPEG(85)
  const thumbnail = downscale(picture, 320).toJPEG(85)
  if (!jpeg.length || !thumbnail.length) throw new Error('Picture could not be encoded')
  return { jpeg, thumbnail }
}

/** Best effort: an unremoved picture is an unused file, never one she can reach. */
export async function removePictures(
  library: KnittingLibrary,
  ids: readonly string[]
): Promise<void> {
  for (const id of ids) await library.remove(id).catch(() => undefined)
}
