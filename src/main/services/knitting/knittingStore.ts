import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { knittingFileSchema, type KnittingFile } from '@shared/knitting/knitting'

const EMPTY: KnittingFile = { version: 1, project: null, patterns: [] }
// 20 patterns of 60 page IDs is about 50 KB; anything far beyond that is not her file.
const MAX_BYTES = 256_000

/**
 * Her project and its row count, kept out of config on purpose: Home writes it
 * on every row, and config is the caregiver's settings, which Home may not
 * write and which a bad save could reset. One small file, replaced atomically.
 */
export class KnittingStore {
  private readonly path: string
  private current: KnittingFile | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly folder: string,
    private readonly onReset: (backupName: string) => void = () => {}
  ) {
    this.path = join(folder, 'project.json')
  }

  read(): Promise<KnittingFile> {
    return this.enqueue(() => this.load())
  }

  /** Changes run one at a time, so two quick taps can't both read the old count. */
  update(change: (file: KnittingFile) => KnittingFile): Promise<KnittingFile> {
    return this.enqueue(async () => {
      const before = await this.load()
      const changed = change(before)
      if (changed === before) return before
      const after = knittingFileSchema.parse(changed)
      await this.save(after)
      this.current = after
      return after
    })
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async load(): Promise<KnittingFile> {
    if (this.current) return this.current
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return (this.current = EMPTY)
      // Busy or locked: fail this request only and read again next time.
      throw new Error('Knitting project unavailable')
    }
    try {
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('too large')
      return (this.current = knittingFileSchema.parse(JSON.parse(raw)))
    } catch {
      // Keep the damaged file for the caregiver rather than overwrite it. If it
      // can't be moved aside, refuse writes instead of losing her count.
      const backupName = `project.corrupt-${Date.now()}.json`
      try {
        await rename(this.path, join(this.folder, backupName))
      } catch {
        throw new Error('Knitting project unavailable')
      }
      this.onReset(backupName)
      return (this.current = EMPTY)
    }
  }

  private async save(file: KnittingFile): Promise<void> {
    const temporary = join(this.folder, `.project-${randomUUID()}.tmp`)
    try {
      await mkdir(this.folder, { recursive: true })
      await writeFile(temporary, JSON.stringify(file), {
        encoding: 'utf8',
        flush: true,
        flag: 'wx'
      })
      await rename(temporary, this.path)
    } catch {
      // Filesystem errors name userData paths; this message crosses IPC instead.
      throw new Error('Could not save her knitting')
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }
}
