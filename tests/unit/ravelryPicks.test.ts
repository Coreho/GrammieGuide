import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AdminKnitting,
  HomeKnitting,
  RavelryAddResult
} from '../../src/shared/knitting/knitting'
import { MAX_RAVELRY_PATTERNS, type RavelryPatternDetails } from '../../src/shared/knitting/ravelry'
import type { LibraryEntry, LibraryMetadata } from '../../src/shared/media/libraryTypes'
import type { PhotoCodec, PhotoImage } from '../../src/main/services/photos/photoLibrary'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  activity: vi.fn(),
  send: vi.fn(),
  admin: { webContents: { mainFrame: {}, send: (...args: unknown[]) => mocks.send(...args) } },
  home: { webContents: { mainFrame: {}, send: (...args: unknown[]) => mocks.send(...args) } }
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  app: { getPath: () => '' },
  dialog: {},
  nativeImage: {}
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.activity }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
import { registerKnittingIpc } from '../../src/main/ipc/knittingIpc'

const admin = { sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame }
const home = { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame }

function image(): PhotoImage {
  const picture: PhotoImage = {
    isEmpty: () => false,
    getSize: () => ({ width: 640, height: 480 }),
    resize: () => picture,
    toJPEG: () => Buffer.from('jpeg')
  }
  return picture
}
const codec: PhotoCodec = { createFromPath: () => image() }

const DETAILS: RavelryPatternDetails = {
  ravelryId: 1001,
  name: 'Garter Baby Blanket',
  designer: 'Ann Example',
  facts: [{ label: 'Yarn', value: 'DK' }],
  notes: 'A simple blanket.',
  pictureUrls: ['https://images.example.com/a.jpg', 'https://images.example.com/b.jpg']
}

let folder: string
let temporary: string
let entries: LibraryEntry[]
const pictures = {
  addImage: vi.fn(async (_jpeg: Buffer, _thumb: Buffer, metadata: LibraryMetadata) => {
    const id = randomUUID()
    const entry = { id, fileName: `${id}.jpg`, thumbFileName: `${id}.thumb.jpg`, metadata }
    entries.push(entry)
    return entry
  }),
  remove: vi.fn(async (id: string) => {
    const before = entries.length
    entries = entries.filter((entry) => entry.id !== id)
    return entries.length < before
  }),
  list: vi.fn(async () => [...entries])
}
const ravelry = {
  pattern: vi.fn(async (ravelryId: number) => ({ ...DETAILS, ravelryId })),
  picture: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }))
}

type Handler = (event: unknown, request?: unknown) => Promise<unknown>
const handler = (channel: string): Handler =>
  mocks.handle.mock.calls.find(([name]) => name === channel)![1] as Handler
const add = (ravelryId = 1001): Promise<RavelryAddResult> =>
  handler('knitting:addRavelry')(admin, { ravelryId }) as Promise<RavelryAddResult>
const homeState = async (): Promise<HomeKnitting> =>
  (await handler('knitting:home')(home)) as HomeKnitting
const adminState = async (): Promise<AdminKnitting> =>
  (await handler('knitting:get')(admin)) as AdminKnitting

beforeEach(() => {
  vi.clearAllMocks()
  entries = []
  folder = mkdtempSync(join(tmpdir(), 'grammieguide-ravelry-picks-'))
  temporary = mkdtempSync(join(tmpdir(), 'grammieguide-ravelry-temp-'))
  const empty = { addImage: vi.fn(), remove: vi.fn(), list: vi.fn(async () => []) }
  registerKnittingIpc({
    patterns: () => empty,
    gallery: () => empty,
    ravelryPictures: () => pictures,
    ravelry: () => ravelry,
    folder: () => folder,
    temporaryFolder: () => temporary,
    codec: () => codec
  })
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
  rmSync(temporary, { recursive: true, force: true })
})

describe('adding a Ravelry pattern for her', () => {
  it('saves a plain-text copy; Home gets only words and this app’s own pictures', async () => {
    const { knitting, failedPictures } = await add()
    expect(failedPictures).toBe(0)
    expect(knitting.ravelry).toEqual([
      {
        id: expect.any(String),
        ravelryId: 1001,
        name: 'Garter Baby Blanket',
        designer: 'Ann Example',
        thumbnailUrl: `grammie-media://ravelry/${entries[0]!.thumbFileName}`
      }
    ])
    const state = await homeState()
    expect(state.ravelry).toEqual([
      {
        id: knitting.ravelry[0]!.id,
        name: 'Garter Baby Blanket',
        designer: 'Ann Example',
        facts: [{ label: 'Yarn', value: 'DK' }],
        notes: 'A simple blanket.',
        thumbnailUrl: `grammie-media://ravelry/${entries[0]!.thumbFileName}`,
        pictures: entries.map((entry) => ({ url: `grammie-media://ravelry/${entry.fileName}` }))
      }
    ])
    expect(JSON.stringify(state)).not.toContain('images.example.com')
    expect(mocks.send).toHaveBeenCalledWith('knitting:changed', {})
  })

  it('leaves no downloaded picture behind in the temporary folder', async () => {
    await add()
    expect(readdirSync(temporary)).toEqual([])
  })

  it('reaches Ravelry only for the add: Home reading it afterwards fetches nothing', async () => {
    await add()
    ravelry.pattern.mockClear()
    ravelry.picture.mockClear()
    await homeState()
    expect(ravelry.pattern).not.toHaveBeenCalled()
    expect(ravelry.picture).not.toHaveBeenCalled()
  })

  it('still saves the words when a picture fails, and says how many', async () => {
    ravelry.picture.mockRejectedValueOnce(new Error('https://images.example.com/a.jpg timed out'))
    const { knitting, failedPictures } = await add()
    expect(failedPictures).toBe(1)
    expect(knitting.ravelry).toHaveLength(1)
    expect((await homeState()).ravelry[0]!.pictures).toHaveLength(1)
  })

  it('counts a picture type it cannot decode as a failed picture', async () => {
    ravelry.picture.mockResolvedValue({ bytes: new Uint8Array([1]), mime: 'image/avif' })
    const { failedPictures } = await add()
    expect(failedPictures).toBe(2)
    expect(pictures.addImage).not.toHaveBeenCalled()
    ravelry.picture.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' })
  })

  it('shows a pattern with no pictures at all, with its words', async () => {
    ravelry.pattern.mockResolvedValueOnce({ ...DETAILS, pictureUrls: [] })
    await add()
    const [saved] = (await homeState()).ravelry
    expect(saved!.pictures).toEqual([])
    expect(saved).not.toHaveProperty('thumbnailUrl')
  })

  it('keeps her shelf unchanged when Ravelry fails', async () => {
    await add()
    ravelry.pattern.mockRejectedValueOnce(new Error("Ravelry can't be reached right now."))
    await expect(add(2002)).rejects.toThrow("can't be reached")
    expect((await adminState()).ravelry).toHaveLength(1)
    expect(entries).toHaveLength(2)
  })

  it('refuses the same pattern twice without fetching it again', async () => {
    await add()
    ravelry.pattern.mockClear()
    await expect(add()).rejects.toThrow('already on her shelf')
    expect(ravelry.pattern).not.toHaveBeenCalled()
  })

  it(`stops at ${MAX_RAVELRY_PATTERNS} patterns`, async () => {
    ravelry.pattern.mockImplementation(async (ravelryId) => ({
      ...DETAILS,
      ravelryId,
      pictureUrls: []
    }))
    for (let id = 1; id <= MAX_RAVELRY_PATTERNS; id++) await add(id)
    await expect(add(999)).rejects.toThrow(`Up to ${MAX_RAVELRY_PATTERNS}`)
    ravelry.pattern.mockImplementation(async (ravelryId) => ({ ...DETAILS, ravelryId }))
  })

  it('takes the pictures back out if the panel locks before the copy is saved', async () => {
    mocks.unlocked
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Admin locked')
      })
    await expect(add()).rejects.toThrow('Admin locked')
    expect(entries).toEqual([])
    expect((await adminState()).ravelry).toEqual([])
  })

  it('is caregiver-only, with a checked pattern number', async () => {
    await expect(handler('knitting:addRavelry')(home, { ravelryId: 1 })).rejects.toThrow(
      'Caregiver window required'
    )
    for (const ravelryId of [0, -1, 1.5, '1', undefined, Number.MAX_VALUE]) {
      await expect(handler('knitting:addRavelry')(admin, { ravelryId })).rejects.toThrow(
        'Unknown pattern'
      )
    }
    expect(ravelry.pattern).not.toHaveBeenCalled()
  })

  it('logs that a pattern changed, never which one', async () => {
    const { knitting } = await add()
    await handler('knitting:removeRavelry')(admin, { id: knitting.ravelry[0]!.id })
    expect(mocks.activity.mock.calls).toEqual([
      ['knitting-ravelry-added'],
      ['knitting-ravelry-removed']
    ])
  })
})

describe('removing a Ravelry pattern', () => {
  it('removes the record and its pictures, and tells both windows', async () => {
    const { knitting } = await add()
    mocks.send.mockClear()
    const after = (await handler('knitting:removeRavelry')(admin, {
      id: knitting.ravelry[0]!.id
    })) as AdminKnitting
    expect(after.ravelry).toEqual([])
    expect(entries).toEqual([])
    expect(mocks.send).toHaveBeenCalledWith('knitting:changed', {})
  })

  it('refuses an unknown ID shape, and is caregiver-only', async () => {
    await expect(handler('knitting:removeRavelry')(admin, { id: '../x' })).rejects.toThrow(
      'Unknown pattern'
    )
    await expect(handler('knitting:removeRavelry')(home, { id: randomUUID() })).rejects.toThrow(
      'Caregiver window required'
    )
  })

  it('does nothing for a pattern that is already gone', async () => {
    await handler('knitting:removeRavelry')(admin, { id: randomUUID() })
    expect(mocks.activity).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
})

describe('a picture that has gone missing', () => {
  it('keeps the pattern and its words, with no address for that picture', async () => {
    await add()
    entries.shift()
    const [saved] = (await homeState()).ravelry
    expect(saved!.notes).toBe('A simple blanket.')
    expect(saved!.pictures[0]).toEqual({ url: undefined })
    expect(saved!.pictures[1]!.url).toMatch(/^grammie-media:\/\/ravelry\//)
    expect(saved).not.toHaveProperty('thumbnailUrl')
  })
})
