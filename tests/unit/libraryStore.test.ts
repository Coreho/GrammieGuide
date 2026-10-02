import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../../src/main/services/media/libraryStore'
import { libraryPaths } from '../../src/main/services/media/libraryPaths'

const leftovers = [
  '.00000000-0000-4000-8000-000000000000.import.tmp',
  '.00000000-0000-4000-8000-000000000000.index.tmp',
  '00000000-0000-4000-8000-000000000000.jpg'
]

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

  async function writeLeftovers(folder: string): Promise<void> {
    await fs.mkdir(folder, { recursive: true })
    for (const name of leftovers) await fs.writeFile(join(folder, name), 'leftover')
  }

  it.each(
    (['photos', 'music'] as const).flatMap((library) =>
      leftovers.map((name) => [library, name] as const)
    )
  )(
    'sweeps %s leftover %s while preserving every listed file and unrelated files',
    async (library, name) => {
      const original = new LibraryStore(userData, library)
      const entries = await original.import([source, source])
      const paths = libraryPaths(userData, library)
      const index = await fs.readFile(paths.index, 'utf8')
      await fs.writeFile(join(paths.folder, name), 'leftover')
      await fs.writeFile(join(paths.folder, 'index.json.corrupt-old'), '{corrupt')
      await fs.writeFile(join(paths.folder, 'notes.txt'), 'keep')
      await fs.mkdir(join(paths.folder, '.directory.import.tmp'))
      await fs.writeFile(join(paths.folder, '.directory.import.tmp', 'child'), 'keep')
      const restarted = new LibraryStore(userData, library)

      expect(await restarted.list()).toEqual(entries)
      await expect(fs.stat(join(paths.folder, name))).rejects.toMatchObject({ code: 'ENOENT' })
      for (const entry of entries) {
        expect(await fs.readFile(join(paths.folder, entry.fileName), 'utf8')).toBe('complete photo')
      }
      expect(await fs.readFile(paths.index, 'utf8')).toBe(index)
      expect(await fs.readFile(join(paths.folder, 'index.json.corrupt-old'), 'utf8')).toBe(
        '{corrupt'
      )
      expect(await fs.readFile(join(paths.folder, 'notes.txt'), 'utf8')).toBe('keep')
      expect(await fs.readFile(join(paths.folder, '.directory.import.tmp', 'child'), 'utf8')).toBe(
        'keep'
      )
    }
  )

  it.each(['photos', 'music'] as const)(
    'preserves imported %s and the corrupt backup, removing only temp files',
    async (library) => {
      const mediaSource = library === 'photos' ? source : join(root, 'private-original.MP3')
      const content = library === 'photos' ? 'complete photo' : 'complete song'
      await fs.writeFile(mediaSource, content)
      const original = new LibraryStore(userData, library)
      const entries = await original.import([mediaSource, mediaSource])
      const paths = libraryPaths(userData, library)
      await writeLeftovers(paths.folder)
      await fs.writeFile(paths.index, '{corrupt')
      const restarted = new LibraryStore(userData, library)

      expect(await restarted.list()).toEqual([])
      expect(await restarted.list()).toEqual([])
      expect(await new LibraryStore(userData, library).list()).toEqual([])
      const remaining = await fs.readdir(paths.folder)
      const backups = remaining.filter((name) => name.startsWith('index.json.corrupt-'))
      expect(backups).toHaveLength(1)
      expect(remaining.sort()).toEqual(
        [...backups, ...entries.map((entry) => entry.fileName), leftovers[2]!].sort()
      )
      expect(await fs.readFile(join(paths.folder, backups[0]!), 'utf8')).toBe('{corrupt')
      for (const entry of entries) {
        expect(await fs.readFile(join(paths.folder, entry.fileName), 'utf8')).toBe(content)
      }
      expect(await fs.readFile(join(paths.folder, leftovers[2]!), 'utf8')).toBe('leftover')
      for (const name of leftovers.slice(0, 2)) {
        await expect(fs.stat(join(paths.folder, name))).rejects.toMatchObject({ code: 'ENOENT' })
      }
    }
  )

  it.each(['EBUSY', 'EPERM', 'ENOENT'])(
    'does not scan or delete anything when reading the index fails with %s',
    async (code) => {
      const entries = await store.import([source])
      const paths = libraryPaths(userData, 'photos')
      await writeLeftovers(paths.folder)
      const readdir = vi.fn(fs.readdir)
      const rm = vi.fn(fs.rm)
      let unreadable = true
      const faulty = new LibraryStore(userData, 'photos', {
        ...fs,
        readdir,
        rm,
        readFile: (async (...args: Parameters<typeof fs.readFile>) => {
          if (unreadable) throw Object.assign(new Error(code), { code })
          return fs.readFile(...args)
        }) as typeof fs.readFile
      })

      if (code === 'ENOENT') expect(await faulty.list()).toEqual([])
      else await expect(faulty.list()).rejects.toThrow('unavailable right now')
      expect(readdir).not.toHaveBeenCalled()
      expect(rm).not.toHaveBeenCalled()
      for (const name of [...leftovers, entries[0]!.fileName]) {
        expect(await fs.readFile(join(paths.folder, name), 'utf8')).toBe(
          name === entries[0]!.fileName ? 'complete photo' : 'leftover'
        )
      }
      if (code !== 'ENOENT') {
        unreadable = false
        expect(await faulty.list()).toEqual(entries)
        expect(readdir).toHaveBeenCalledTimes(1)
        for (const name of leftovers) {
          await expect(fs.stat(join(paths.folder, name))).rejects.toMatchObject({ code: 'ENOENT' })
        }
      }
    }
  )

  it('does not sweep on this or later requests when a corrupt-index backup fails', async () => {
    const entries = await store.import([source])
    const paths = libraryPaths(userData, 'photos')
    await writeLeftovers(paths.folder)
    await fs.writeFile(paths.index, '{corrupt')
    const readdir = vi.fn(fs.readdir)
    const rm = vi.fn(fs.rm)
    const faulty = new LibraryStore(userData, 'photos', {
      ...fs,
      readdir,
      rm,
      rename: async () => {
        throw new Error('disk full')
      }
    })

    expect(await faulty.list()).toEqual([])
    expect(await faulty.list()).toEqual([])
    await expect(faulty.import([source])).rejects.toThrow('recovery')
    expect(readdir).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
    expect(await fs.readFile(paths.index, 'utf8')).toBe('{corrupt')
    for (const name of [...leftovers, entries[0]!.fileName]) {
      expect(await fs.readFile(join(paths.folder, name), 'utf8')).toBe(
        name === entries[0]!.fileName ? 'complete photo' : 'leftover'
      )
    }
  })

  it('does no constructor work and holds the operation queue until the load sweep finishes', async () => {
    const entries = await store.import([source])
    const paths = libraryPaths(userData, 'photos')
    await writeLeftovers(paths.folder)
    let releaseSweep!: () => void
    const blocked = new Promise<void>((resolve) => {
      releaseSweep = resolve
    })
    let markStarted!: (started: boolean) => void
    const started = new Promise<boolean>((resolve) => {
      markStarted = resolve
    })
    const mkdir = vi.fn(fs.mkdir)
    const readFile = vi.fn(fs.readFile)
    const readdir = vi.fn(fs.readdir)
    const copyFile = vi.fn(fs.copyFile)
    const rm = vi.fn(async (...args: Parameters<typeof fs.rm>) => {
      if (args[0] === join(paths.folder, leftovers[0]!)) {
        markStarted(true)
        await blocked
      }
      await fs.rm(...args)
    })
    const restarted = new LibraryStore(userData, 'photos', {
      ...fs,
      mkdir,
      readFile,
      readdir,
      copyFile,
      rm
    })
    await Promise.resolve()
    for (const method of [mkdir, readFile, readdir, copyFile, rm]) {
      expect(method).not.toHaveBeenCalled()
    }

    const loading = restarted.list()
    const importing = restarted.import([source])
    const sweeping = await Promise.race([started, loading.then(() => false)])
    const copiedWhileSweeping = copyFile.mock.calls.length
    releaseSweep()
    const [listed, added] = await Promise.all([loading, importing])
    expect(sweeping).toBe(true)
    expect(copiedWhileSweeping).toBe(0)
    expect(listed).toEqual(entries)
    expect(await restarted.list()).toEqual([...entries, ...added])
    for (const entry of [...entries, ...added]) {
      expect(await fs.readFile(join(paths.folder, entry.fileName), 'utf8')).toBe('complete photo')
    }
  })

  it('sweeps only on the first load of an instance, including when mutations load it', async () => {
    await store.import([source])
    const paths = libraryPaths(userData, 'photos')
    await writeLeftovers(paths.folder)
    const readdir = vi.fn(fs.readdir)
    const restarted = new LibraryStore(userData, 'photos', { ...fs, readdir })

    const [added] = await restarted.import([source])
    expect(readdir).toHaveBeenCalledTimes(1)
    await writeLeftovers(paths.folder)
    await restarted.list()
    await restarted.update(added!.id, { caption: 'Family' })
    await restarted.remove(added!.id)
    expect(readdir).toHaveBeenCalledTimes(1)
    for (const name of leftovers) {
      expect(await fs.readFile(join(paths.folder, name), 'utf8')).toBe('leftover')
    }
    await new LibraryStore(userData, 'photos').list()
    for (const name of leftovers) {
      await expect(fs.stat(join(paths.folder, name))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it.each(['scan', 'delete'] as const)(
    'keeps the library usable if cleanup cannot %s',
    async (failure) => {
      const entries = await store.import([source])
      const paths = libraryPaths(userData, 'photos')
      await writeLeftovers(paths.folder)
      const restarted = new LibraryStore(userData, 'photos', {
        ...fs,
        readdir: (async (...args: Parameters<typeof fs.readdir>) => {
          if (failure === 'scan') throw new Error('directory busy')
          return fs.readdir(...args)
        }) as typeof fs.readdir,
        rm: async (...args) => {
          if (failure === 'delete' && args[0] === join(paths.folder, leftovers[0]!)) {
            throw new Error('file busy')
          }
          await fs.rm(...args)
        }
      })

      expect(await restarted.list()).toEqual(entries)
      expect(await restarted.import([source])).toHaveLength(1)
      expect(await restarted.list()).toHaveLength(2)
      expect(await fs.readFile(join(paths.folder, entries[0]!.fileName), 'utf8')).toBe(
        'complete photo'
      )
      expect(await fs.readFile(join(paths.folder, leftovers[0]!), 'utf8')).toBe('leftover')
      if (failure === 'delete') {
        for (const name of leftovers.slice(1)) {
          await expect(fs.stat(join(paths.folder, name))).rejects.toMatchObject({ code: 'ENOENT' })
        }
      }
    }
  )

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

  it('retries an index that is briefly unreadable instead of treating it as empty', async () => {
    const entries = await store.import([source])
    let busy = true
    const flaky = new LibraryStore(userData, 'photos', {
      ...fs,
      readFile: (async (...args: Parameters<typeof fs.readFile>) => {
        if (busy) throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' })
        return fs.readFile(...args)
      }) as typeof fs.readFile
    })
    await expect(flaky.list()).rejects.toThrow('unavailable right now')
    await expect(flaky.import([source])).rejects.toThrow('unavailable right now')
    busy = false
    expect(await flaky.list()).toEqual(entries)
    expect(await flaky.import([source])).toHaveLength(1)
    expect(await new LibraryStore(userData, 'photos').list()).toHaveLength(2)
  })

  it('rejects structural and non-finite metadata patches without changing the index', async () => {
    const entries = await store.import([source])
    await expect(store.update(entries[0]!.id, { duration: Infinity })).rejects.toThrow()
    // File identities are immutable; a metadata field can never redirect deletion.
    await store.update(entries[0]!.id, { fileName: '../config.json' })
    expect((await store.list())[0]!.fileName).toBe(entries[0]!.fileName)
  })
})
