import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  EMPTY_NURSING_FILE,
  nursingFileSchema,
  type NursingFile
} from '@shared/nursing/nursingHistory'

// The schema's limits (20 chapters of 40 papers of 120 page IDs, 4,000-character stories) come
// to about 3.8 MB; a real history is a small fraction of that, and anything bigger is not hers.
const MAX_BYTES = 4_000_000

/**
 * Her nursing history (nursing/history.json), outside config like her knitting: it is
 * personal writing, not a setting, and a bad config save must never be able to lose it.
 * Home only reads it. The file is replaced atomically, and a damaged one is set aside for the
 * caregiver as history.corrupt-<ts>.json (reported through onReset) while Home starts empty;
 * if it can't be moved aside, reads fail instead of anything overwriting it.
 */
export class NursingStore {
  private readonly path: string
  private current: NursingFile | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly folder: string,
    private readonly onReset: (backupName: string) => void = () => {}
  ) {
    this.path = join(folder, 'history.json')
  }

  read(): Promise<NursingFile> {
    return this.enqueue(() => this.load())
  }

  /** Saves a whole new history (validated first, so a bad one changes nothing). */
  replace(file: NursingFile): Promise<NursingFile> {
    return this.enqueue(async () => {
      const parsed = nursingFileSchema.parse(file)
      await this.save(parsed)
      return (this.current = parsed)
    })
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async load(): Promise<NursingFile> {
    if (this.current) return this.current
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return (this.current = EMPTY_NURSING_FILE)
      }
      // Busy or locked: fail this request only and read again next time.
      throw new Error('Nursing history unavailable')
    }
    try {
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('too large')
      return (this.current = nursingFileSchema.parse(JSON.parse(raw)))
    } catch {
      const backupName = `history.corrupt-${Date.now()}.json`
      try {
        await rename(this.path, join(this.folder, backupName))
      } catch {
        throw new Error('Nursing history unavailable')
      }
      this.onReset(backupName)
      return (this.current = EMPTY_NURSING_FILE)
    }
  }

  private async save(file: NursingFile): Promise<void> {
    const temporary = join(this.folder, `.history-${randomUUID()}.tmp`)
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
      throw new Error('Could not save her nursing history')
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }
}
