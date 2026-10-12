import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../../src/main/services/media/libraryStore'
import { MusicLibrary } from '../../src/main/services/music/musicLibrary'

describe('managed music imports', () => {
  let root: string
  let source: string
  let store: LibraryStore
  const read = vi.fn()
  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'grammie-music-'))
    source = join(root, 'private.mp3')
    await fs.writeFile(source, 'complete audio')
    store = new LibraryStore(join(root, 'profile'), 'music')
    read.mockReset().mockResolvedValue({
      title: 'Familiar song',
      artist: 'Family',
      durationMs: 1200,
      art: Buffer.from('cover')
    })
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('publishes audio, cover and metadata together, retaining the source and no source path', async () => {
    const library = new MusicLibrary(store, read)
    expect(await library.import([source], () => {})).toEqual({ imported: 1, failed: 0 })
    const tracks = await library.list()
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ title: 'Familiar song', artist: 'Family', durationMs: 1200 })
    expect(JSON.stringify(tracks)).not.toContain(root)
    const entry = (await store.list())[0]!
    const folder = join(root, 'profile', 'media', 'music')
    expect(await fs.readFile(join(folder, entry.fileName), 'utf8')).toBe('complete audio')
    expect(await fs.readFile(join(folder, entry.thumbFileName!), 'utf8')).toBe('cover')
    expect(await fs.readFile(source, 'utf8')).toBe('complete audio')
    const restarted = new MusicLibrary(new LibraryStore(join(root, 'profile'), 'music'), read)
    expect(await restarted.list()).toEqual(tracks)
  })

  it('continues after a metadata failure and an unsupported extension, reporting each file', async () => {
    read.mockRejectedValueOnce(new Error('private source cannot decode'))
    const progress: unknown[] = []
    const library = new MusicLibrary(store, read)
    expect(
      await library.import([source, 'private.exe', source], (value) => progress.push(value))
    ).toEqual({ imported: 1, failed: 2 })
    expect(progress).toEqual([
      { total: 3, completed: 0, imported: 0, failed: 0 },
      { total: 3, completed: 1, imported: 0, failed: 1 },
      { total: 3, completed: 2, imported: 0, failed: 2 },
      { total: 3, completed: 3, imported: 1, failed: 2 }
    ])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('rolls back both files when the index cannot be published', async () => {
    const failing = new LibraryStore(join(root, 'profile'), 'music', {
      ...fs,
      writeFile: async (path, data) => {
        if (path.endsWith('.index.tmp')) throw new Error('full disk')
        await fs.writeFile(path, data)
      }
    })
    expect(await new MusicLibrary(failing, read).import([source], () => {})).toEqual({
      imported: 0,
      failed: 1
    })
    expect(await failing.list()).toEqual([])
    expect(await fs.readdir(join(root, 'profile', 'media', 'music'))).toEqual([])
  })

  it('removes the audio and art together', async () => {
    const library = new MusicLibrary(store, read)
    await library.import([source], () => {})
    const entry = (await store.list())[0]!
    expect(await library.remove(entry.id)).toBe(true)
    expect(await library.list()).toEqual([])
    const files = await fs.readdir(join(root, 'profile', 'media', 'music'))
    expect(files).not.toContain(entry.fileName)
    expect(files).not.toContain(entry.thumbFileName)
  })
})
