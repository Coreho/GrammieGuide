import * as fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import { isMediaLibrary, type MediaLibrary } from '@shared/media/mediaPath'
import type { LibraryEntry, LibraryMetadata } from '@shared/media/libraryTypes'
import { libraryPaths } from './libraryPaths'

type LibraryIO = Pick<typeof fs, 'mkdir' | 'readFile' | 'copyFile' | 'rename' | 'rm' | 'open'> & {
  writeFile: (path: string, data: string) => Promise<void>
}

const disk: LibraryIO = {
  ...fs,
  writeFile: (path, data) => fs.writeFile(path, data, { flush: true })
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metadata(value: unknown): LibraryMetadata {
  if (
    !isRecord(value) ||
    Object.values(value).some(
      (item) =>
        item !== null &&
        typeof item !== 'string' &&
        typeof item !== 'boolean' &&
        !(typeof item === 'number' && Number.isFinite(item))
    )
  )
    throw new Error('Invalid library metadata')
  return { ...value } as LibraryMetadata
}

function parseIndex(raw: string): LibraryEntry[] {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || !Array.isArray(value.entries)) throw new Error('Invalid library index')
  const ids = new Set<string>()
  return value.entries.map((entry: unknown) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !UUID.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.fileName !== 'string' ||
      !entry.fileName.startsWith(`${entry.id}.`) ||
      !/^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(entry.fileName) ||
      Object.keys(entry).some((key) => !['id', 'fileName', 'metadata'].includes(key))
    ) {
      throw new Error('Invalid library entry')
    }
    ids.add(entry.id)
    return { id: entry.id, fileName: entry.fileName, metadata: metadata(entry.metadata) }
  })
}

/** One main-process instance per library. Mutations queue to avoid lost index updates. */
export class LibraryStore {
  private readonly paths: ReturnType<typeof libraryPaths>
  private entries: LibraryEntry[] | undefined
  private recoveryError: unknown
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    userData: string,
    library: MediaLibrary,
    private readonly io: LibraryIO = disk
  ) {
    if (!isMediaLibrary(library)) throw new Error('Invalid media library')
    this.paths = libraryPaths(userData, library)
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    // A failed operation must not poison subsequent requests.
    this.queue = result.catch(() => undefined)
    return result
  }

  private async load(): Promise<LibraryEntry[]> {
    if (this.entries) return this.entries
    await this.io.mkdir(this.paths.folder, { recursive: true })
    let raw: string
    try {
      raw = await this.io.readFile(this.paths.index, 'utf8')
    } catch (error) {
      this.entries = []
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.recoveryError = error
      return this.entries
    }
    try {
      this.entries = parseIndex(raw)
    } catch {
      this.entries = []
      try {
        await this.io.rename(
          this.paths.index,
          `${this.paths.index}.corrupt-${Date.now()}-${randomUUID()}`
        )
      } catch (error) {
        // Still allow an empty read, but never overwrite an index we could not back up.
        this.recoveryError = error
      }
    }
    return this.entries
  }

  private async save(entries: LibraryEntry[]): Promise<void> {
    if (this.recoveryError) throw new Error('Library index recovery failed')
    const temporary = join(this.paths.folder, `.${randomUUID()}.index.tmp`)
    try {
      await this.io.writeFile(temporary, JSON.stringify({ entries }))
      await this.io.rename(temporary, this.paths.index)
      this.entries = entries
    } finally {
      await this.io.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  list(): Promise<LibraryEntry[]> {
    return this.run(async () => structuredClone(await this.load()))
  }

  /** A batch commits together. Paths are consumed here and never retained or returned. */
  import(paths: string[]): Promise<LibraryEntry[]> {
    return this.run(async () => {
      const current = await this.load()
      if (this.recoveryError) throw new Error('Library index recovery failed')
      if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
        throw new Error('Invalid import paths')
      }
      if (!paths.length) return []
      const added: LibraryEntry[] = []
      const cleanup: string[] = []
      try {
        for (const source of paths) {
          const extension = extname(source).toLowerCase()
          if (!/^\.[a-z0-9]{1,10}$/.test(extension)) throw new Error('Invalid media extension')
          const id = randomUUID()
          const fileName = `${id}${extension}`
          const destination = join(this.paths.folder, fileName)
          const temporary = join(this.paths.folder, `.${id}.import.tmp`)
          cleanup.push(temporary, destination)
          await this.io.copyFile(source, temporary)
          // Flush the complete copy before publishing it, then publish the index last.
          const file = await this.io.open(temporary, 'r+')
          try {
            await file.sync()
          } finally {
            await file.close()
          }
          await this.io.rename(temporary, destination)
          added.push({ id, fileName, metadata: {} })
        }
        await this.save([...current, ...added])
        return structuredClone(added)
      } catch (error) {
        await Promise.all(
          cleanup.map((path) => this.io.rm(path, { force: true }).catch(() => undefined))
        )
        throw error
      }
    })
  }

  update(id: string, patch: LibraryMetadata): Promise<LibraryEntry> {
    return this.run(async () => {
      const current = await this.load()
      const existing = current.find((entry) => entry.id === id)
      if (!existing) throw new Error('Library entry not found')
      const updated = { ...existing, metadata: { ...existing.metadata, ...metadata(patch) } }
      await this.save(current.map((entry) => (entry.id === id ? updated : entry)))
      return structuredClone(updated)
    })
  }

  remove(id: string): Promise<boolean> {
    return this.run(async () => {
      const current = await this.load()
      const entry = current.find((item) => item.id === id)
      if (!entry) return false
      // Commit first: an interrupted deletion can leave an unused file, never a dangling entry.
      await this.save(current.filter((item) => item.id !== id))
      await this.io.rm(join(this.paths.folder, entry.fileName), { force: true })
      return true
    })
  }
}
