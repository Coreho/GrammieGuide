import { basename, extname } from 'node:path'
import { parseFile, selectCover } from 'music-metadata'
import type { PhotoImage } from '../photos/photoLibrary'
import type { ReadTrackMetadata } from './musicLibrary'

/** The parser and native art decoding stay in main; no source paths cross IPC. */
export function createTrackMetadataReader(
  decodeArt: (bytes: Buffer) => PhotoImage
): ReadTrackMetadata {
  return async (path) => {
    const result = await parseFile(path, { duration: true })
    if (!result.format.container || !result.format.codec) throw new Error('Unreadable music file')
    const cover = selectCover(result.common.picture)
    let art: Buffer | undefined
    // Reject oversized embedded images before asking a native decoder to allocate them.
    if (cover && cover.data.byteLength <= 5 * 1024 * 1024) {
      try {
        let image = decodeArt(Buffer.from(cover.data))
        if (!image.isEmpty()) {
          const { width, height } = image.getSize()
          if (width > 0 && height > 0) {
            if (Math.max(width, height) > 320)
              image = image.resize(width >= height ? { width: 320 } : { height: 320 })
            const bytes = image.toJPEG(85)
            if (bytes.length <= 300_000) art = bytes
          }
        }
      } catch {
        /* A bad cover must not cost a playable song. */
      }
    }
    return {
      title: (result.common.title?.trim() || basename(path, extname(path))).slice(0, 200),
      artist: (result.common.artist ?? '').slice(0, 200),
      durationMs:
        Number.isFinite(result.format.duration) && result.format.duration! > 0
          ? Math.round(result.format.duration! * 1000)
          : 0,
      ...(art ? { art } : {})
    }
  }
}
