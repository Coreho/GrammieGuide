import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RAVELRY_PICTURE_EDGE } from '@shared/knitting/ravelry'
import { encodePicture, type KnittingLibrary } from '../knitting/knittingPictures'
import type { PhotoCodec } from '../photos/photoLibrary'
import type { RavelrySource } from './ravelryService'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

/**
 * Each picture goes through the same decode and re-encode as a family photo, so only
 * JPEGs this app wrote are ever served to Home, never what Ravelry's servers sent.
 * The codec reads from a path, so the bytes spend a moment in a temporary file.
 */
export async function importRavelryPictures(
  urls: readonly string[],
  source: Pick<RavelrySource, 'picture'>,
  library: KnittingLibrary,
  codec: PhotoCodec,
  folder: string,
  ravelryId: number
): Promise<{ pictures: string[]; failed: number }> {
  const pictures: string[] = []
  let failed = 0
  for (const url of urls) {
    const temporary = join(folder, `grammieguide-ravelry-${randomUUID()}`)
    let path: string | undefined
    try {
      const { bytes, mime } = await source.picture(url)
      const extension = EXTENSIONS[mime]
      if (!extension) throw new Error('Unsupported picture type')
      path = `${temporary}.${extension}`
      await writeFile(path, bytes, { flag: 'wx' })
      const { jpeg, thumbnail } = await encodePicture(path, codec, RAVELRY_PICTURE_EDGE)
      pictures.push((await library.addImage(jpeg, thumbnail, { ravelryId })).id)
    } catch {
      // One unreadable picture affects only itself; its address never goes back to admin.
      failed += 1
    } finally {
      if (path) await rm(path, { force: true }).catch(() => undefined)
    }
  }
  return { pictures, failed }
}
