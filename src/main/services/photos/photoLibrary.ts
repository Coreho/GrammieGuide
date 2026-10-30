import { extname } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import type { LibraryEntry, LibraryMetadata } from '@shared/media/libraryTypes'
import {
  PHOTO_EXTENSIONS,
  type Photo,
  type PhotoPatch,
  type PhotoImportProgress,
  type PhotoImportResult
} from '@shared/media/photoTypes'
import { LibraryStore } from '../media/libraryStore'

/** Structural codec keeps Electron out of the service's node-environment unit tests. */
export interface PhotoImage {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
  resize(options: { width?: number; height?: number }): PhotoImage
  toJPEG(quality: number): Buffer
}

export interface PhotoCodec {
  createFromPath(path: string): PhotoImage | Promise<PhotoImage>
}

/** Bounds the longer edge; knitting patterns reuse it with a larger limit so text stays sharp. */
export function downscale(image: PhotoImage, limit: number): PhotoImage {
  const { width, height } = image.getSize()
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Photo could not be decoded')
  }
  if (Math.max(width, height) <= limit) return image
  // Specifying only the longer edge preserves aspect ratio, including portrait photos.
  return image.resize(width >= height ? { width: limit } : { height: limit })
}

function photo(entry: LibraryEntry, position: number): Photo {
  const { caption, showToHer, order } = entry.metadata
  return {
    id: entry.id,
    url: `grammie-media://photos/${entry.fileName}`,
    thumbnailUrl: `grammie-media://photos/${entry.thumbFileName ?? entry.fileName}`,
    caption: typeof caption === 'string' ? caption : '',
    // Older raw media entries have never been approved for her photo viewer.
    showToHer: showToHer === true,
    importIndex: position,
    order: typeof order === 'number' && Number.isSafeInteger(order) && order >= 0 ? order : position
  }
}

export function validatePhotoPatch(value: unknown): PhotoPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid photo changes')
  const patch = value as Record<string, unknown>
  if (
    Object.keys(patch).some((key) => !['caption', 'showToHer', 'order'].includes(key)) ||
    ('caption' in patch && (typeof patch.caption !== 'string' || patch.caption.length > 2000)) ||
    ('showToHer' in patch && typeof patch.showToHer !== 'boolean') ||
    ('order' in patch &&
      (typeof patch.order !== 'number' || !Number.isSafeInteger(patch.order) || patch.order < 0))
  )
    throw new Error('Invalid photo changes')
  return { ...patch } as PhotoPatch
}

export class PhotoLibrary {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: LibraryStore,
    private readonly codec: PhotoCodec
  ) {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  async listAll(): Promise<Photo[]> {
    return (await this.store.list()).map(photo).sort((a, b) => a.order - b.order)
  }

  async listVisible(): Promise<Photo[]> {
    return (await this.listAll()).filter((entry) => entry.showToHer)
  }

  import(
    paths: string[],
    progress: (count: PhotoImportProgress) => void
  ): Promise<PhotoImportResult> {
    return this.run(async () => {
      const existing = await this.listAll()
      let order = existing.reduce((next, entry) => Math.max(next, entry.order + 1), 0)
      const count: PhotoImportProgress = {
        total: paths.length,
        completed: 0,
        imported: 0,
        failed: 0
      }
      progress({ ...count })
      for (const source of paths) {
        try {
          if (
            !PHOTO_EXTENSIONS.some((extension) => `.${extension}` === extname(source).toLowerCase())
          ) {
            throw new Error('Unsupported photo type')
          }
          const decoded = await this.codec.createFromPath(source)
          if (decoded.isEmpty()) throw new Error('Photo could not be decoded')
          const image = downscale(decoded, 1600)
          const jpeg = image.toJPEG(85)
          const thumbnail = downscale(image, 320).toJPEG(85)
          if (!jpeg.length || !thumbnail.length) throw new Error('Photo could not be encoded')
          await this.store.addImage(jpeg, thumbnail, { caption: '', showToHer: true, order })
          order += 1
          count.imported += 1
        } catch {
          // A bad decode (including HEIC without a codec) or write affects only this file.
          // Never send filenames, codec errors or filesystem paths back to the caregiver.
          count.failed += 1
        }
        count.completed += 1
        progress({ ...count })
        // Native decoding is synchronous; give IPC and the progress UI time between images.
        await setImmediate()
      }
      return { imported: count.imported, failed: count.failed }
    })
  }

  update(id: string, patch: PhotoPatch): Promise<Photo> {
    const validated = validatePhotoPatch(patch)
    return this.run(async () => {
      const entries = await this.store.list()
      const position = entries.findIndex((entry) => entry.id === id)
      return photo(await this.store.update(id, validated as LibraryMetadata), position)
    })
  }

  remove(id: string): Promise<boolean> {
    return this.run(() => this.store.remove(id))
  }
}
