import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../../src/main/services/media/libraryStore'
import { libraryPaths } from '../../src/main/services/media/libraryPaths'

describe('media library store', () => {
  let root: string
  let userData: string
  let source: string
  let store: LibraryStore

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'grammie-library-'))
    userData = join(root, 'userData')
    source = join(root, 'private-original.JPG')
    await fs.writeFile(source, 'complete photo')
    store = new LibraryStore(userData, 'photos')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('keeps independent indexes outside config and copies under unique generated names', async () => {
    await fs.mkdir(userData, { recursive: true })
    await fs.writeFile(join(userData, 'config.json'), 'untouched')
    const photos = await store.import([source, source])
    const music = new LibraryStore(userData, 'music')
    expect(await music.list()).toEqual([])
    await music.import([source])
    expect(await store.list()).toEqual(photos)
    expect(photos[0]!.fileName).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(photos[0]!.fileName).not.toBe(photos[1]!.fileName)
    for (const entry of photos) {
      expect(
        await fs.readFile(join(libraryPaths(userData, 'photos').folder, entry.fileName), 'utf8')
      ).toBe('complete photo')
    }
    const raw = await fs.readFile(libraryPaths(userData, 'photos').index, 'utf8')
    expect(raw).not.toContain(source)
    expect(raw).not.toContain('private-original')
    expect(JSON.stringify(photos)).not.toContain(root)
    expect(await fs.readFile(join(userData, 'config.json'), 'utf8')).toBe('untouched')
    expect(await new LibraryStore(userData, 'photos').list()).toEqual(photos)
    expect(await fs.readFile(source, 'utf8')).toBe('complete photo')
  })

  it('persists metadata updates, returns detached lists, and deletes only the removed entry file', async () => {
    const [first, second] = await store.import([source, source])
    const updated = await store.update(first!.id, { caption: 'Family', year: 2026 })
    expect(updated.metadata).toEqual({ caption: 'Family', year: 2026 })
    const listed = await store.list()
    listed[0]!.metadata.caption = 'mutated'
    expect((await store.list())[0]!.metadata.caption).toBe('Family')
    expect(await new LibraryStore(userData, 'photos').list()).toEqual([updated, second])
    await store.remove(first!.id)
    await expect(
      fs.stat(join(libraryPaths(userData, 'photos').folder, first!.fileName))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      await fs.readFile(join(libraryPaths(userData, 'photos').folder, second!.fileName), 'utf8')
    ).toBe('complete photo')
    expect(await new LibraryStore(userData, 'photos').list()).toEqual([second])
    await expect(store.update('missing', {})).rejects.toThrow()
    expect(await store.remove('missing')).toBe(false)
  })

  it('starts empty when missing and remains usable', async () => {
    expect(await store.list()).toEqual([])
    expect(await fs.readdir(libraryPaths(userData, 'photos').folder)).toEqual([])
    expect(await store.import([source])).toHaveLength(1)
  })

  it.each([
    '{broken',
    '{}',
    '{"entries":[{}]}',
    JSON.stringify({ entries: [{ id: 'bad', fileName: '../config.json', metadata: {} }] })
  ])('backs up a corrupt index verbatim and starts empty: %s', async (raw) => {
    const paths = libraryPaths(userData, 'photos')
    await fs.mkdir(paths.folder, { recursive: true })
    await fs.writeFile(paths.index, raw)
    expect(await store.list()).toEqual([])
    const backups = (await fs.readdir(paths.folder)).filter((name) =>
      name.startsWith('index.json.corrupt-')
    )
    expect(backups).toHaveLength(1)
    expect(await fs.readFile(join(paths.folder, backups[0]!), 'utf8')).toBe(raw)
    const entries = await store.import([source])
    expect(await new LibraryStore(userData, 'photos').list()).toEqual(entries)
  })

  it.each(['copy', 'write', 'rename'] as const)(
    'rolls back a partial %s failure without losing earlier entries',
    async (failure) => {
      const previous = await store.import([source])
      let failed = false
      const faulty = new LibraryStore(userData, 'photos', {
        ...fs,
        copyFile: async (from, to) => {
          if (failure === 'copy' && !failed) {
            failed = true
            await fs.writeFile(to, 'partial')
            throw new Error('disk full')
          }
          await fs.copyFile(from, to)
        },
        writeFile: async (file, data) => {
          if (failure === 'write' && !failed) {
            failed = true
            await fs.writeFile(file, '{partial')
            throw new Error('disk full')
          }
          await fs.writeFile(file, data)
        },
        rename: async (from, to) => {
          if (failure === 'rename' && to === libraryPaths(userData, 'photos').index && !failed) {
            failed = true
            throw new Error('disk full')
          }
          await fs.rename(from, to)
        }
      })
      await expect(faulty.import([source, source])).rejects.toThrow('disk full')
      expect(await faulty.list()).toEqual(previous)
      expect(await new LibraryStore(userData, 'photos').list()).toEqual(previous)
      expect((await fs.readdir(libraryPaths(userData, 'photos').folder)).sort()).toEqual(
        ['index.json', previous[0]!.fileName].sort()
      )
      expect(await faulty.import([source])).toHaveLength(1)
      expect(await faulty.list()).toHaveLength(2)
    }
  )

  it('publishes neither file when the second source in a batch is missing', async () => {
    await expect(store.import([source, join(root, 'missing.jpg')])).rejects.toThrow()
    expect(await store.list()).toEqual([])
    expect(await fs.readdir(libraryPaths(userData, 'photos').folder)).toEqual([])
  })

  it('ignores interrupted temporary indexes and files on restart, preserving the last committed index', async () => {
    const entries = await store.import([source])
    const paths = libraryPaths(userData, 'photos')
    await fs.writeFile(join(paths.folder, '.interrupted.tmp'), '{partial')
    await fs.writeFile(join(paths.folder, '00000000-0000-4000-8000-000000000000.jpg'), 'orphan')
    store = new LibraryStore(userData, 'photos')
    expect(await store.list()).toEqual(entries)
    await store.import([source])
    expect(await new LibraryStore(userData, 'photos').list()).toHaveLength(2)
  })

  it('serializes concurrent mutations so entries are never lost', async () => {
    const [a, b] = await Promise.all([store.import([source]), store.import([source])])
    await Promise.all([
      store.update(a[0]!.id, { caption: 'A' }),
      store.update(b[0]!.id, { caption: 'B' })
    ])
    expect(
      (await new LibraryStore(userData, 'photos').list()).map((entry) => entry.metadata.caption)
    ).toEqual(['A', 'B'])
  })

  it('preserves the committed entry and file when an update or removal cannot save', async () => {
    const entries = await store.import([source])
    const faulty = new LibraryStore(userData, 'photos', {
      ...fs,
      writeFile: async () => {
        throw new Error('disk full')
      }
    })
    await expect(faulty.update(entries[0]!.id, { caption: 'unsaved' })).rejects.toThrow('disk full')
    await expect(faulty.remove(entries[0]!.id)).rejects.toThrow('disk full')
    expect(await faulty.list()).toEqual(entries)
    expect(await new LibraryStore(userData, 'photos').list()).toEqual(entries)
    expect(
      await fs.readFile(join(libraryPaths(userData, 'photos').folder, entries[0]!.fileName), 'utf8')
    ).toBe('complete photo')
  })

  it('returns empty without overwriting a corrupt index if its backup cannot be written', async () => {
    const paths = libraryPaths(userData, 'photos')
    await fs.mkdir(paths.folder, { recursive: true })
    await fs.writeFile(paths.index, '{corrupt')
    const faulty = new LibraryStore(userData, 'photos', {
      ...fs,
      rename: async () => {
        throw new Error('disk full')
      }
    })
    expect(await faulty.list()).toEqual([])
    await expect(faulty.import([source])).rejects.toThrow('recovery')
    expect(await fs.readFile(paths.index, 'utf8')).toBe('{corrupt')
  })

  it('rejects structural and non-finite metadata patches without changing the index', async () => {
    const entries = await store.import([source])
    await expect(store.update(entries[0]!.id, { duration: Infinity })).rejects.toThrow()
    // File identities are immutable; a metadata field can never redirect deletion.
    await store.update(entries[0]!.id, { fileName: '../config.json' })
    expect((await store.list())[0]!.fileName).toBe(entries[0]!.fileName)
  })
})
