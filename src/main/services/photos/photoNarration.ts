import type { LibraryStore } from '../media/libraryStore'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import type { Photo } from '@shared/media/photoTypes'
import { isLibraryMediaExtension } from '@shared/media/mediaTypes'
import { MAX_NARRATION_BYTES } from '@shared/media/narration'

/** Mutation callers share runPhotoOperation with photo editing/removal. The store owns disk atomicity. */
export class PhotoNarration {
  constructor(
    private readonly photos: LibraryStore,
    private readonly audio: LibraryStore,
    private readonly validate: (bytes: Buffer, extension: string) => Promise<void>
  ) {}
  async save(photoId: string, bytes: Buffer, extension: string): Promise<LibraryEntry> {
    if (
      !bytes.length ||
      bytes.length > MAX_NARRATION_BYTES ||
      !isLibraryMediaExtension('narration', extension)
    )
      throw new Error('Use an audio recording or file under 20 MB')
    if (!(await this.photos.list()).some((photo) => photo.id === photoId))
      throw new Error('Photo unavailable')
    await this.validate(bytes, extension)
    const previous = (await this.audio.list()).filter((entry) => entry.metadata.photoId === photoId)
    // Newest entry wins if power is lost between publication and old-copy cleanup.
    const next = await this.audio.addBytes(bytes, extension, {
      photoId,
      autoPlay: previous.at(-1)?.metadata.autoPlay === true
    })
    for (const old of previous) await this.audio.remove(old.id).catch(() => {})
    return next
  }
  async remove(photoId: string): Promise<void> {
    for (const entry of await this.audio.list()) {
      if (entry.metadata.photoId === photoId) await this.audio.remove(entry.id)
    }
  }
  async setAutoPlay(photoId: string, enabled: boolean): Promise<void> {
    const entry = (await this.audio.list()).findLast((clip) => clip.metadata.photoId === photoId)
    if (!entry) throw new Error('Narration unavailable')
    await this.audio.update(entry.id, { autoPlay: enabled })
  }
  async decorate(photos: Photo[]): Promise<Photo[]> {
    let entries: LibraryEntry[]
    try {
      entries = await this.audio.list()
    } catch {
      return photos
    }
    const byPhoto = new Map(entries.map((entry) => [entry.metadata.photoId, entry]))
    return photos.map((photo) => {
      const clip = byPhoto.get(photo.id)
      return clip
        ? {
            ...photo,
            narration: {
              url: `grammie-media://narration/${clip.fileName}`,
              autoPlay: clip.metadata.autoPlay === true
            }
          }
        : photo
    })
  }
}
