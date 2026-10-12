import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../../src/main/services/media/libraryStore'
import { libraryPaths } from '../../src/main/services/media/libraryPaths'
import {
  PhotoLibrary,
  type PhotoImage,
  validatePhotoPatch
} from '../../src/main/services/photos/photoLibrary'
import type { PhotoImportProgress } from '../../src/shared/media/photoTypes'

function image(width: number, height: number, resizes: unknown[] = [], empty = false): PhotoImage {
  return {
    isEmpty: () => empty,
    getSize: () => ({ width, height }),
    resize: (options) => {
      resizes.push(options)
      const scale = options.width ? options.width / width : options.height! / height
      return image(Math.round(width * scale), Math.round(height * scale), resizes)
    },
    toJPEG: (quality) => Buffer.from(JSON.stringify({ width, height, quality }))
  }
}

describe('photo library', () => {
  let root: string
  let store: LibraryStore
  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'grammie-photos-'))
    store = new LibraryStore(root, 'photos')
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it.each([
    [4000, 3000, 1600, 1200, 320, 240, [{ width: 1600 }, { width: 320 }]],
    [3000, 4000, 1200, 1600, 240, 320, [{ height: 1600 }, { height: 320 }]],
    [2000, 2000, 1600, 1600, 320, 320, [{ width: 1600 }, { width: 320 }]],
    [800, 1200, 800, 1200, 213, 320, [{ height: 320 }]],
    [120, 80, 120, 80, 120, 80, []]
  ])(
    'encodes %sx%s as a bounded JPEG and thumbnail without upscaling',
    async (w, h, fw, fh, tw, th, calls) => {
      const resizes: unknown[] = []
      const library = new PhotoLibrary(store, {
        createFromPath: () => image(w as number, h as number, resizes)
      })
      expect(await library.import(['private-original.PNG'], () => undefined)).toEqual({
        imported: 1,
        failed: 0
      })
      expect(resizes).toEqual(calls)
      const [entry] = await store.list()
      const folder = libraryPaths(root, 'photos').folder
      expect(entry!.fileName).toMatch(/^[0-9a-f-]{36}\.jpg$/)
      expect(entry!.thumbFileName).toBe(`${entry!.id}.thumb.jpg`)
      expect(JSON.parse(await fs.readFile(join(folder, entry!.fileName), 'utf8'))).toEqual({
        width: fw,
        height: fh,
        quality: 85
      })
      expect(JSON.parse(await fs.readFile(join(folder, entry!.thumbFileName!), 'utf8'))).toEqual({
        width: tw,
        height: th,
        quality: 85
      })
      expect(await new LibraryStore(root, 'photos').list()).toEqual([entry])
    }
  )

  it('continues after empty and throwing decodes mid-batch, reporting each attempt with no paths', async () => {
    const decode = vi.fn((path: string) => {
      if (path.endsWith('bad.heic')) return image(0, 0, [], true)
      if (path.endsWith('broken.jpg')) throw new Error(`decode ${path}`)
      return image(3000, 4000)
    })
    const library = new PhotoLibrary(store, { createFromPath: decode })
    const counts: PhotoImportProgress[] = []
    expect(
      await library.import(
        ['private/first.JPG', 'private/bad.heic', 'private/broken.jpg', 'private/last.webp'],
        (count) => counts.push(count)
      )
    ).toEqual({ imported: 2, failed: 2 })
    expect(counts).toEqual([
      { total: 4, completed: 0, imported: 0, failed: 0 },
      { total: 4, completed: 1, imported: 1, failed: 0 },
      { total: 4, completed: 2, imported: 1, failed: 1 },
      { total: 4, completed: 3, imported: 1, failed: 2 },
      { total: 4, completed: 4, imported: 2, failed: 2 }
    ])
    expect((await library.listAll()).map((entry) => entry.order)).toEqual([0, 1])
    const serialized = JSON.stringify([counts, await library.listAll(), await store.list()])
    expect(serialized).not.toContain('private')
    expect(await fs.readFile(libraryPaths(root, 'photos').index, 'utf8')).not.toContain('private')
  })

  it('imports all supported types and counts unsupported files as failed', async () => {
    const decode = vi.fn(() => image(400, 600))
    const library = new PhotoLibrary(store, { createFromPath: decode })
    expect(
      await library.import(
        ['a.jpg', 'b.JPEG', 'c.PNG', 'd.WeBp', 'e.HEIC', 'bad.exe'],
        () => undefined
      )
    ).toEqual({ imported: 5, failed: 1 })
    expect(decode).toHaveBeenCalledTimes(5)
  })

  it.each([image(0, 10), image(NaN, 20), { ...image(20, 20), toJPEG: () => Buffer.alloc(0) }])(
    'counts invalid sizes and empty encodes as failures',
    async (decoded) => {
      const library = new PhotoLibrary(store, { createFromPath: () => decoded })
      expect(await library.import(['a.jpg'], () => undefined)).toEqual({ imported: 0, failed: 1 })
      expect(await store.list()).toEqual([])
    }
  )

  it('persists captions, visibility and caregiver order outside config, and removes both images', async () => {
    await fs.writeFile(join(root, 'config.json'), 'unchanged')
    const library = new PhotoLibrary(store, { createFromPath: () => image(500, 700) })
    await library.import(['a.jpg', 'b.png', 'c.webp'], () => undefined)
    const [a, b, c] = await library.listAll()
    await library.update(a!.id, { caption: 'At the lake', showToHer: false })
    await library.update(c!.id, { order: 0 })
    await library.update(b!.id, { order: 5 })
    const restarted = new PhotoLibrary(new LibraryStore(root, 'photos'), {
      createFromPath: () => image(1, 1)
    })
    expect((await restarted.listVisible()).map((entry) => entry.id)).toEqual([c!.id, b!.id])
    expect((await restarted.listAll())[0]).toMatchObject({
      caption: 'At the lake',
      showToHer: false
    })
    for (const photo of await restarted.listAll()) {
      expect(photo.url).toMatch(/^grammie-media:\/\/photos\/[0-9a-f-]{36}\.jpg$/)
      expect(photo.thumbnailUrl).toMatch(/^grammie-media:\/\/photos\/[0-9a-f-]{36}\.thumb\.jpg$/)
    }
    expect(await fs.readFile(join(root, 'config.json'), 'utf8')).toBe('unchanged')
    expect(await restarted.remove(a!.id)).toBe(true)
    await expect(
      fs.stat(join(libraryPaths(root, 'photos').folder, `${a!.id}.jpg`))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.stat(join(libraryPaths(root, 'photos').folder, `${a!.id}.thumb.jpg`))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await restarted.remove(a!.id)).toBe(false)
  })

  it('assigns distinct append orders to concurrent imports and reports progress for a large batch', async () => {
    const library = new PhotoLibrary(store, { createFromPath: () => image(10, 10) })
    const counts: PhotoImportProgress[] = []
    await Promise.all([
      library.import(
        Array.from({ length: 30 }, (_, i) => `${i}.jpg`),
        (count) => counts.push(count)
      ),
      library.import(['last.jpg'], () => undefined)
    ])
    expect((await library.listAll()).map((entry) => entry.order)).toEqual(
      Array.from({ length: 31 }, (_, i) => i)
    )
    expect(counts).toHaveLength(31)
    expect(counts.at(-1)).toEqual({ total: 30, completed: 30, imported: 30, failed: 0 })
  })

  it('rolls back a failed thumbnail write and continues with later photos', async () => {
    // addImage writes the photo, then the thumbnail; fail the first photo's thumbnail.
    let imageWrites = 0
    const faulty = new LibraryStore(root, 'photos', {
      ...fs,
      writeFile: async (path, bytes) => {
        if (path.endsWith('.import.tmp') && ++imageWrites === 2) {
          await fs.writeFile(path, 'partial')
          throw new Error(`ENOSPC ${path}`)
        }
        await fs.writeFile(path, bytes)
      }
    })
    const library = new PhotoLibrary(faulty, { createFromPath: () => image(100, 100) })
    expect(await library.import(['a.jpg', 'b.jpg'], () => undefined)).toEqual({
      imported: 1,
      failed: 1
    })
    const [entry] = await faulty.list()
    expect((await fs.readdir(libraryPaths(root, 'photos').folder)).sort()).toEqual(
      ['index.json', entry!.fileName, entry!.thumbFileName!].sort()
    )
  })

  it('cleans orphan thumbnails after a trusted restart but preserves listed thumbnails', async () => {
    const library = new PhotoLibrary(store, { createFromPath: () => image(10, 10) })
    await library.import(['a.jpg'], () => undefined)
    const orphan = join(
      libraryPaths(root, 'photos').folder,
      '00000000-0000-4000-8000-000000000000.thumb.jpg'
    )
    await fs.writeFile(orphan, 'orphan')
    const [entry] = await new LibraryStore(root, 'photos').list()
    await expect(fs.stat(orphan)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      (await fs.stat(join(libraryPaths(root, 'photos').folder, entry!.thumbFileName!))).isFile()
    ).toBe(true)
  })

  it('rolls back both images when publishing the index fails, preserving earlier photos', async () => {
    const library = new PhotoLibrary(store, { createFromPath: () => image(100, 100) })
    await library.import(['existing.jpg'], () => undefined)
    const original = await store.list()
    const paths = libraryPaths(root, 'photos')
    let fail = true
    const faulty = new LibraryStore(root, 'photos', {
      ...fs,
      rename: async (from, to) => {
        if (fail && to === paths.index) {
          fail = false
          throw new Error(`EPERM ${to}`)
        }
        await fs.rename(from, to)
      }
    })
    const resumed = new PhotoLibrary(faulty, { createFromPath: () => image(100, 100) })
    expect(await resumed.import(['failed.jpg', 'next.jpg'], () => undefined)).toEqual({
      imported: 1,
      failed: 1
    })
    const entries = await new LibraryStore(root, 'photos').list()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual(original[0])
    expect((await fs.readdir(paths.folder)).sort()).toEqual(
      ['index.json', ...entries.flatMap((entry) => [entry.fileName, entry.thumbFileName!])].sort()
    )
  })

  it('preserves full photos and thumbnails when recovering a corrupt index', async () => {
    const library = new PhotoLibrary(store, { createFromPath: () => image(100, 100) })
    await library.import(['existing.jpg'], () => undefined)
    const [entry] = await store.list()
    const paths = libraryPaths(root, 'photos')
    await fs.writeFile(paths.index, '{corrupt')
    expect(await new LibraryStore(root, 'photos').list()).toEqual([])
    const files = await fs.readdir(paths.folder)
    expect(files).toContain(entry!.fileName)
    expect(files).toContain(entry!.thumbFileName)
    const backup = files.find((name) => name.startsWith('index.json.corrupt-'))
    expect(backup).toBeDefined()
    expect(await fs.readFile(join(paths.folder, backup!), 'utf8')).toBe('{corrupt')
  })

  it.each([
    { caption: 1 },
    { caption: 'x'.repeat(2001) },
    { showToHer: 'yes' },
    { order: -1 },
    { order: Infinity },
    { order: 1.5 },
    { order: Number.MAX_SAFE_INTEGER + 1 },
    { sourcePath: 'private' },
    null,
    []
  ])('rejects malformed photo metadata: %j', (patch) => {
    expect(() => validatePhotoPatch(patch)).toThrow('Invalid photo changes')
  })
})
