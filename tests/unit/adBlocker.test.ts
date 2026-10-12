import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  fromPrebuilt: vi.fn(),
  fromLists: vi.fn(),
  session: {},
  logReliabilityEvent: vi.fn()
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
    unlink: vi.fn(actual.unlink)
  }
})
vi.mock('electron', () => ({ session: { fromPartition: () => mocks.session } }))
vi.mock('@ghostery/adblocker-electron', () => ({
  ElectronBlocker: {
    fromPrebuiltAdsAndTracking: mocks.fromPrebuilt,
    fromLists: mocks.fromLists
  },
  adsAndTrackingLists: []
}))
vi.mock('../../src/main/services/browser/webSession', () => ({
  WEB_PARTITION: 'persist:web',
  hardenWebSession: vi.fn()
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({
  logReliabilityEvent: mocks.logReliabilityEvent
}))

import {
  isAdBlockerActive,
  refreshAdBlockerLists,
  startAdBlocker,
  stopAdBlocker
} from '../../src/main/services/browser/adBlocker'

interface CacheOptions {
  path: string
  read: (path: string) => Promise<Uint8Array>
  write: (path: string, buffer: Uint8Array) => Promise<void>
}

function fakeEngine(): {
  enableBlockingInSession: ReturnType<typeof vi.fn>
  disableBlockingInSession: ReturnType<typeof vi.fn>
  serialize: () => Uint8Array
} {
  return {
    enableBlockingInSession: vi.fn(),
    disableBlockingInSession: vi.fn(),
    serialize: () => new Uint8Array([4, 5, 6])
  }
}

describe('ad-blocker cache cleanup', () => {
  let root: string
  let cache: string
  let temporary: string
  let options: CacheOptions

  beforeEach(async () => {
    vi.resetAllMocks()
    root = await fs.mkdtemp(join(tmpdir(), 'grammie-adblock-cache-'))
    cache = join(root, 'adblocker-engine.bin')
    temporary = `${cache}.tmp`
    await fs.writeFile(cache, 'saved engine')
    mocks.fromPrebuilt.mockImplementation(async (_fetch, cacheOptions: CacheOptions) => {
      options = cacheOptions
      await cacheOptions.read(cacheOptions.path)
      return fakeEngine()
    })
    mocks.fromLists.mockResolvedValue(fakeEngine())
  })

  afterEach(async () => {
    stopAdBlocker()
    await fs.rm(root, { recursive: true, force: true })
  })

  it('removes a crashed write on offline startup without touching the saved engine or lookalikes', async () => {
    await fs.writeFile(temporary, 'partial engine')
    await fs.writeFile(`${temporary}.notes`, 'keep')
    await fs.writeFile(join(root, 'other.tmp'), 'keep')

    expect(await startAdBlocker(root)).toBe(true)

    await expect(fs.stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readFile(cache, 'utf8')).toBe('saved engine')
    expect(await fs.readFile(`${temporary}.notes`, 'utf8')).toBe('keep')
    expect(await fs.readFile(join(root, 'other.tmp'), 'utf8')).toBe('keep')
    expect(mocks.fromLists).not.toHaveBeenCalled()
  })

  it('starts normally when there is no abandoned temp file', async () => {
    expect(await startAdBlocker(root)).toBe(true)
    expect(isAdBlockerActive()).toBe(true)
    expect(await fs.readFile(cache, 'utf8')).toBe('saved engine')
  })

  it('never recursively deletes a directory with the temp-file name', async () => {
    await fs.mkdir(temporary)
    await fs.writeFile(join(temporary, 'notes.txt'), 'keep')

    expect(await startAdBlocker(root)).toBe(true)
    expect(await fs.readFile(join(temporary, 'notes.txt'), 'utf8')).toBe('keep')
  })

  it('keeps blocking when a locked leftover cannot be removed at startup', async () => {
    await fs.writeFile(temporary, 'partial engine')
    vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('locked temp file'))

    expect(await startAdBlocker(root)).toBe(true)
    expect(isAdBlockerActive()).toBe(true)
    expect(await fs.readFile(cache, 'utf8')).toBe('saved engine')
  })

  it.each(['write', 'rename'] as const)(
    'cleans up a failed %s while preserving the saved engine and original error',
    async (operation) => {
      await startAdBlocker(root)
      const failure = new Error(`failed ${operation}`)
      if (operation === 'write') {
        vi.mocked(fs.writeFile).mockImplementationOnce(async (path) => {
          // A disk-full error can occur after part of the buffer reaches disk.
          const actual = await vi.importActual<typeof fs>('node:fs/promises')
          await actual.writeFile(path, 'partial engine')
          throw failure
        })
      } else {
        vi.mocked(fs.rename).mockRejectedValueOnce(failure)
      }

      await expect(options.write(cache, new Uint8Array([4, 5, 6]))).rejects.toBe(failure)

      await expect(fs.stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await fs.readFile(cache, 'utf8')).toBe('saved engine')
    }
  )

  it('does not replace the write error with a cleanup error', async () => {
    await startAdBlocker(root)
    const failure = new Error('rename failed')
    vi.mocked(fs.rename).mockRejectedValueOnce(failure)
    vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(options.write(cache, new Uint8Array([4, 5, 6]))).rejects.toBe(failure)
    expect(await fs.readFile(cache, 'utf8')).toBe('saved engine')
  })

  it('keeps the refreshed blocker active when saving fails and removes the failed write', async () => {
    await startAdBlocker(root)
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error('cache locked'))

    expect(await refreshAdBlockerLists()).toBe(true)

    expect(isAdBlockerActive()).toBe(true)
    await expect(fs.stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readFile(cache, 'utf8')).toBe('saved engine')
    expect(mocks.logReliabilityEvent).toHaveBeenLastCalledWith({
      op: 'adblocker-update',
      ok: false,
      detail: 'lists updated, but the saved copy could not be replaced'
    })
  })
})
