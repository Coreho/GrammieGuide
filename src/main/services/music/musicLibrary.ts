import { extname } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import {
  MUSIC_EXTENSIONS,
  type MusicTrack,
  type MusicImportResult,
  type MusicImportProgress
} from '@shared/music/musicTypes'
import type { LibraryStore } from '../media/libraryStore'

export interface TrackMetadata {
  title: string
  artist: string
  durationMs: number
  art?: Buffer
}
export type ReadTrackMetadata = (path: string) => Promise<TrackMetadata>

function track(entry: LibraryEntry): MusicTrack {
  const metadata = entry.metadata
  return {
    id: entry.id,
    url: `grammie-media://music/${entry.fileName}`,
    title: typeof metadata.title === 'string' && metadata.title ? metadata.title : 'Song',
    artist: typeof metadata.artist === 'string' ? metadata.artist : '',
    durationMs:
      typeof metadata.durationMs === 'number' && metadata.durationMs >= 0 ? metadata.durationMs : 0,
    ...(entry.thumbFileName ? { artUrl: `grammie-media://music/${entry.thumbFileName}` } : {})
  }
}

export class MusicLibrary {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly store: LibraryStore,
    private readonly readMetadata: ReadTrackMetadata
  ) {}

  async list(): Promise<MusicTrack[]> {
    return (await this.store.list()).map(track)
  }
  remove(id: string): Promise<boolean> {
    return this.store.remove(id)
  }

  import(
    paths: string[],
    progress: (count: MusicImportProgress) => void
  ): Promise<MusicImportResult> {
    const work = this.queue.then(async () => {
      const count: MusicImportProgress = {
        total: paths.length,
        completed: 0,
        imported: 0,
        failed: 0
      }
      progress({ ...count })
      for (const source of paths) {
        try {
          if (
            !MUSIC_EXTENSIONS.some((extension) => `.${extension}` === extname(source).toLowerCase())
          )
            throw new Error('Unsupported music type')
          const { art, ...metadata } = await this.readMetadata(source)
          await this.store.addFile(source, metadata, art)
          count.imported++
        } catch {
          count.failed++
        }
        count.completed++
        progress({ ...count })
        await setImmediate()
      }
      return { imported: count.imported, failed: count.failed }
    })
    this.queue = work.catch(() => undefined)
    return work
  }
}
