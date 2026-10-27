import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LibraryEntry, LibraryMetadata } from '../../src/shared/media/libraryTypes'
import type { PhotoCodec, PhotoImage } from '../../src/main/services/photos/photoLibrary'
import type {
  AdminKnitting,
  HomeKnitting,
  PieceImportResult
} from '../../src/shared/knitting/knitting'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  activity: vi.fn(),
  adminSend: vi.fn(),
  homeSend: vi.fn(),
  admin: { webContents: { mainFrame: {}, send: (...args: unknown[]) => mocks.adminSend(...args) } },
  home: { webContents: { mainFrame: {}, send: (...args: unknown[]) => mocks.homeSend(...args) } }
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

const home = { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame }
const admin = { sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame }
const photoId = '22222222-2222-4222-8222-222222222222'

function page(): PhotoImage {
  const image: PhotoImage = {
    isEmpty: () => false,
    getSize: () => ({ width: 1000, height: 1400 }),
    resize: () => image,
    toJPEG: () => Buffer.from('jpeg')
  }
  return image
}
const codec: PhotoCodec = { createFromPath: () => page() }

let folder: string
let clock: number
let picked: string[] | null
let pickedPhoto: string | null
let entries: LibraryEntry[]
let pieceEntries: LibraryEntry[]
const gallery = {
  addImage: vi.fn(async (_jpeg: Buffer, _thumb: Buffer, metadata: LibraryMetadata) => {
    const id = randomUUID()
    const entry = { id, fileName: `${id}.jpg`, thumbFileName: `${id}.thumb.jpg`, metadata }
    pieceEntries.push(entry)
    return entry
  }),
  remove: vi.fn(async (id: string) => {
    const before = pieceEntries.length
    pieceEntries = pieceEntries.filter((entry) => entry.id !== id)
    return pieceEntries.length < before
  }),
  list: vi.fn(async () => [...pieceEntries])
}
const library = {
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

type Handler = (event: unknown, request?: unknown) => Promise<unknown>
const handler = (channel: string): Handler =>
  mocks.handle.mock.calls.find(([name]) => name === channel)![1] as Handler
const homeState = async (): Promise<HomeKnitting> =>
  (await handler('knitting:home')(home)) as HomeKnitting
const adminState = async (): Promise<AdminKnitting> =>
  (await handler('knitting:get')(admin)) as AdminKnitting
const addPattern = async (name: string, paths: string[]): Promise<AdminKnitting> => {
  picked = paths
  return ((await handler('knitting:addPattern')(admin, { name })) as { knitting: AdminKnitting })
    .knitting
}
const addPiece = async (
  what: string,
  forWhom = '',
  path = 'C:\\photos\\piece.jpg'
): Promise<PieceImportResult> => {
  pickedPhoto = path
  return (await handler('knitting:addPiece')(admin, { what, forWhom })) as PieceImportResult
}
const empty = { project: null, patterns: [], pieces: [] }

beforeEach(() => {
  vi.clearAllMocks()
  folder = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-ipc-'))
  clock = 100_000
  picked = null
  pickedPhoto = null
  entries = []
  pieceEntries = []
  registerKnittingIpc({
    patterns: () => library,
    gallery: () => gallery,
    pickPicture: async () => pickedPhoto,
    photo: async (id) =>
      id === photoId
        ? {
            url: 'grammie-media://photos/a.jpg',
            thumbnailUrl: 'grammie-media://photos/a.thumb.jpg'
          }
        : undefined,
    folder: () => folder,
    now: () => clock,
    codec: () => codec,
    pickPages: async () => picked
  })
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('knitting IPC: her project', () => {
  it('shows Home a calm empty state before anything is set up', async () => {
    expect(await homeState()).toEqual(empty)
    expect(await handler('knitting:changeRows')(home, { direction: 'add' })).toEqual(empty)
    expect(mocks.activity).not.toHaveBeenCalled()
  })

  it('lets the caregiver set up her project, and Home count rows with a double-tap guard', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Scarf', forWhom: 'Tom', photoId })
    expect((await homeState()).project).toEqual({
      name: 'Scarf',
      forWhom: 'Tom',
      rows: 0,
      photoUrl: 'grammie-media://photos/a.jpg',
      thumbnailUrl: 'grammie-media://photos/a.thumb.jpg'
    })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    clock += 200
    const doubled = (await handler('knitting:changeRows')(home, {
      direction: 'add'
    })) as HomeKnitting
    expect(doubled.project!.rows).toBe(1)
    clock += 5_000
    await handler('knitting:changeRows')(home, { direction: 'add' })
    expect((await adminState()).project).toEqual({
      name: 'Scarf',
      forWhom: 'Tom',
      photoId,
      rows: 2
    })
    expect(mocks.homeSend).toHaveBeenCalledWith('knitting:changed', {})
    expect(mocks.adminSend).toHaveBeenCalledWith('knitting:changed', {})
  })

  it('keeps her count when the caregiver edits the details, and starts over only on request', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Scarf', forWhom: 'Tom' })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    await handler('knitting:saveProject')(admin, { name: 'Long scarf', forWhom: 'Tom' })
    expect((await adminState()).project).toMatchObject({ name: 'Long scarf', rows: 1 })
    await handler('knitting:saveProject')(admin, { name: 'Hat', forWhom: '', startNew: true })
    expect((await adminState()).project).toMatchObject({ name: 'Hat', rows: 0 })
  })

  it('resets and removes only from the caregiver side', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Scarf' })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    expect(await handler('knitting:resetRows')(admin)).toMatchObject({ project: { rows: 0 } })
    expect(await handler('knitting:removeProject')(admin)).toEqual(empty)
    expect(await homeState()).toEqual(empty)
  })

  it.each([
    'knitting:get',
    'knitting:saveProject',
    'knitting:resetRows',
    'knitting:removeProject',
    'knitting:addPattern',
    'knitting:removePattern',
    'knitting:addPiece',
    'knitting:movePiece',
    'knitting:removePiece'
  ])('refuses Home and a locked admin for %s', async (channel) => {
    const request = { name: 'Scarf', what: 'Scarf', id: randomUUID(), direction: 'later' }
    await expect(handler(channel)(home, request)).rejects.toThrow('Caregiver window required')
    await expect(
      handler(channel)({ sender: admin.sender, senderFrame: {} }, request)
    ).rejects.toThrow('Caregiver window required')
    mocks.unlocked.mockImplementationOnce(() => {
      throw new Error('admin unlock required')
    })
    await expect(handler(channel)(admin, request)).rejects.toThrow('admin unlock required')
  })

  it.each(['knitting:home', 'knitting:changeRows', 'knitting:patternPage'])(
    'refuses anything but Home for %s',
    async (channel) => {
      await expect(
        handler(channel)(admin, { direction: 'add', patternId: randomUUID(), page: 0 })
      ).rejects.toThrow('Home window required')
    }
  )

  it('rejects an unknown row change', async () => {
    await expect(handler('knitting:changeRows')(home, { direction: 'reset' })).rejects.toThrow()
  })

  it('never logs what she is making, who it is for, or a pattern name', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Secret scarf', forWhom: 'Granddaughter' })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    clock += 5_000
    await handler('knitting:changeRows')(home, { direction: 'remove' })
    await handler('knitting:resetRows')(admin)
    const added = await addPattern('Private cable', ['C:\\patterns\\page1.png'])
    await handler('knitting:removePattern')(admin, { id: added.patterns[0]!.id })
    await addPiece('Wedding shawl', 'Niece', 'C:\\photos\\shawl.jpg')
    const pieces = (await addPiece('Mittens', 'Neighbour')).knitting.pieces
    await handler('knitting:movePiece')(admin, { id: pieces[1]!.id, direction: 'earlier' })
    await handler('knitting:removePiece')(admin, { id: pieces[0]!.id })
    const logged = JSON.stringify(mocks.activity.mock.calls)
    for (const detail of [
      'Secret',
      'Granddaughter',
      'Private',
      'page1',
      'Wedding',
      'Niece',
      'shawl',
      'Mittens',
      'Neighbour'
    ]) {
      expect(logged).not.toContain(detail)
    }
    expect(mocks.activity.mock.calls.map(([type]) => type)).toEqual([
      'knitting-project-saved',
      'knitting-row-added',
      'knitting-row-removed',
      'knitting-rows-reset',
      'knitting-pattern-added',
      'knitting-pattern-removed',
      'knitting-piece-added',
      'knitting-piece-added',
      'knitting-piece-moved',
      'knitting-piece-removed'
    ])
  })
})

describe('knitting IPC: patterns', () => {
  it('turns the picked pages into one named pattern, in page order, with only media URLs', async () => {
    const result = (await (async () => {
      picked = ['C:\\p\\page10.png', 'C:\\p\\page2.jpg', 'C:\\p\\page1.png', 'C:\\p\\notes.txt']
      return handler('knitting:addPattern')(admin, { name: ' Cable scarf ' })
    })()) as { knitting: AdminKnitting; added: number; failed: number }
    expect(result.added).toBe(3)
    expect(result.failed).toBe(1)
    expect(result.knitting.patterns).toEqual([
      expect.objectContaining({ name: 'Cable scarf', pageCount: 3 })
    ])
    const [pattern] = (await homeState()).patterns
    expect(pattern!.lastPage).toBe(0)
    expect(pattern!.pages.map((p) => p.url)).toEqual(
      entries.map((entry) => `grammie-media://patterns/${entry.fileName}`)
    )
    expect(pattern!.thumbnailUrl).toBe(`grammie-media://patterns/${entries[0]!.thumbFileName}`)
    expect(JSON.stringify(await homeState())).not.toContain('C:\\')
    expect(entries.every((entry) => entry.metadata.patternId === pattern!.id)).toBe(true)
  })

  it('adds nothing when the caregiver cancels the picker', async () => {
    const result = await handler('knitting:addPattern')(admin, { name: 'Hat' })
    expect(result).toMatchObject({ added: 0, failed: 0, knitting: { patterns: [] } })
    expect(library.addImage).not.toHaveBeenCalled()
  })

  it('rechecks the lock after the picker closes and imports nothing if it was locked', async () => {
    picked = ['C:\\p\\page1.png']
    mocks.unlocked
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('admin unlock required')
      })
    await expect(handler('knitting:addPattern')(admin, { name: 'Hat' })).rejects.toThrow(
      'admin unlock required'
    )
    expect(library.addImage).not.toHaveBeenCalled()
  })

  it('refuses a pattern with no readable page and leaves nothing behind', async () => {
    picked = ['C:\\p\\notes.txt']
    await expect(handler('knitting:addPattern')(admin, { name: 'Hat' })).rejects.toThrow(
      'None of those pictures could be read as pages.'
    )
    expect((await adminState()).patterns).toEqual([])
  })

  it('remembers the page she is on, within the pattern', async () => {
    const id = (await addPattern('Hat', ['a1.png', 'a2.png', 'a3.png'])).patterns[0]!.id
    await handler('knitting:patternPage')(home, { patternId: id, page: 2 })
    expect((await homeState()).patterns[0]!.lastPage).toBe(2)
    await handler('knitting:patternPage')(home, { patternId: id, page: 99 })
    expect((await homeState()).patterns[0]!.lastPage).toBe(2)
    await expect(
      handler('knitting:patternPage')(home, { patternId: id, page: -1 })
    ).rejects.toThrow()
    // An unknown pattern changes nothing.
    await handler('knitting:patternPage')(home, { patternId: randomUUID(), page: 0 })
    expect((await homeState()).patterns[0]!.lastPage).toBe(2)
  })

  it('links a pattern to her project, and saving the project keeps every pattern', async () => {
    const id = (await addPattern('Hat', ['a1.png'])).patterns[0]!.id
    await handler('knitting:saveProject')(admin, { name: 'Hat', patternId: id })
    expect((await homeState()).project!.patternId).toBe(id)
    expect((await adminState()).patterns).toHaveLength(1)
    // An ID that isn't a saved pattern is dropped, not stored.
    await handler('knitting:saveProject')(admin, { name: 'Hat', patternId: randomUUID() })
    expect((await adminState()).project!.patternId).toBeUndefined()
    await handler('knitting:removeProject')(admin)
    expect((await adminState()).patterns).toHaveLength(1)
  })

  it('removes a pattern, its pages, and its link to her project', async () => {
    const id = (await addPattern('Hat', ['a1.png', 'a2.png'])).patterns[0]!.id
    await handler('knitting:saveProject')(admin, { name: 'Hat', patternId: id })
    expect(await handler('knitting:removePattern')(admin, { id })).toMatchObject({ patterns: [] })
    expect(entries).toEqual([])
    expect((await homeState()).project!.patternId).toBeUndefined()
    await expect(handler('knitting:removePattern')(admin, { id: 'not-an-id' })).rejects.toThrow()
  })

  it('shows a page whose picture is gone as missing instead of failing', async () => {
    await addPattern('Hat', ['a1.png', 'a2.png'])
    entries.splice(1, 1)
    const [pattern] = (await homeState()).patterns
    expect(pattern!.pages[0]!.url).toMatch(/^grammie-media:\/\/patterns\//)
    expect(pattern!.pages[1]!.url).toBeUndefined()
    library.list.mockRejectedValueOnce(new Error('EBUSY C:\\Users\\her\\media'))
    expect((await homeState()).patterns[0]!.pages.every((p) => p.url === undefined)).toBe(true)
  })
})

describe('knitting IPC: her finished pieces', () => {
  it('adds a finished piece from one picked photo, newest first, with only media URLs', async () => {
    await addPiece(' Blue cardigan ', 'Ella')
    const result = await addPiece('Mittens')
    expect(result.added).toBe(true)
    expect(result.knitting.pieces.map((piece) => [piece.what, piece.forWhom])).toEqual([
      ['Mittens', ''],
      ['Blue cardigan', 'Ella']
    ])
    const pieces = (await homeState()).pieces
    expect(pieces.map((piece) => piece.url)).toEqual(
      [...pieceEntries].reverse().map((entry) => `grammie-media://knitted/${entry.fileName}`)
    )
    expect(pieces[0]!.thumbnailUrl).toBe(
      `grammie-media://knitted/${pieceEntries[1]!.thumbFileName}`
    )
    expect(JSON.stringify(await homeState())).not.toContain('C:\\')
    expect(pieceEntries.map((entry) => entry.metadata.pieceId)).toEqual(
      [...pieces].reverse().map((piece) => piece.id)
    )
    expect(mocks.homeSend).toHaveBeenCalledWith('knitting:changed', {})
  })

  it('adds nothing when the caregiver cancels the picker', async () => {
    const result = await handler('knitting:addPiece')(admin, { what: 'Hat' })
    expect(result).toMatchObject({ added: false, knitting: { pieces: [] } })
    expect(gallery.addImage).not.toHaveBeenCalled()
  })

  it('needs what the piece is before opening the picker', async () => {
    pickedPhoto = 'C:\\photos\\piece.jpg'
    await expect(handler('knitting:addPiece')(admin, { what: '  ' })).rejects.toThrow()
    expect(gallery.addImage).not.toHaveBeenCalled()
  })

  it('rechecks the lock after the picker closes and adds nothing if it was locked', async () => {
    pickedPhoto = 'C:\\photos\\piece.jpg'
    mocks.unlocked
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('admin unlock required')
      })
    await expect(handler('knitting:addPiece')(admin, { what: 'Hat' })).rejects.toThrow(
      'admin unlock required'
    )
    expect(gallery.addImage).not.toHaveBeenCalled()
  })

  it('refuses a photo that cannot be read, in plain words, and keeps nothing', async () => {
    await expect(addPiece('Hat', '', 'C:\\photos\\notes.txt')).rejects.toThrow(
      "That photo couldn't be read. Try a JPEG or PNG photo."
    )
    expect(pieceEntries).toEqual([])
    expect((await adminState()).pieces).toEqual([])
  })

  it('keeps folder names out of a failed save', async () => {
    gallery.addImage.mockRejectedValueOnce(new Error("EPERM: open 'C:\\Users\\her\\media'"))
    await expect(addPiece('Hat')).rejects.toThrow('Could not save the photo. Try again.')
  })

  it('takes the photo back out if the piece itself cannot be saved', async () => {
    mocks.unlocked
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('admin unlock required')
      })
    await expect(addPiece('Hat')).rejects.toThrow('admin unlock required')
    expect(gallery.addImage).toHaveBeenCalledOnce()
    expect(pieceEntries).toEqual([])
    expect((await adminState()).pieces).toEqual([])
  })

  it('refuses a piece past the limit without opening the picker', async () => {
    const pieces = Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      what: 'Scarf',
      forWhom: '',
      picture: randomUUID()
    }))
    writeFileSync(
      join(folder, 'project.json'),
      JSON.stringify({ version: 1, project: null, patterns: [], pieces })
    )
    await expect(addPiece('Hat')).rejects.toThrow('Up to 100 pieces can be saved.')
    expect(gallery.addImage).not.toHaveBeenCalled()
  })

  it('moves a piece earlier or later, and removes a piece with its photo', async () => {
    await addPiece('Scarf')
    await addPiece('Hat')
    await addPiece('Socks')
    const ids = (await adminState()).pieces.map((piece) => piece.id)
    const order = async (): Promise<string[]> =>
      (await adminState()).pieces.map((piece) => piece.what)
    expect(await order()).toEqual(['Socks', 'Hat', 'Scarf'])
    await handler('knitting:movePiece')(admin, { id: ids[2], direction: 'earlier' })
    expect(await order()).toEqual(['Socks', 'Scarf', 'Hat'])
    expect((await homeState()).pieces.map((piece) => piece.what)).toEqual(['Socks', 'Scarf', 'Hat'])
    // Already first: nothing changes, so nothing is logged or announced.
    mocks.activity.mockClear()
    mocks.homeSend.mockClear()
    await handler('knitting:movePiece')(admin, { id: ids[0], direction: 'earlier' })
    expect(mocks.activity).not.toHaveBeenCalled()
    expect(mocks.homeSend).not.toHaveBeenCalled()
    await expect(
      handler('knitting:movePiece')(admin, { id: ids[0], direction: 'sideways' })
    ).rejects.toThrow()
    await expect(
      handler('knitting:movePiece')(admin, { id: 'not-an-id', direction: 'later' })
    ).rejects.toThrow()

    const result = (await handler('knitting:removePiece')(admin, { id: ids[1] })) as AdminKnitting
    expect(result.pieces.map((piece) => piece.what)).toEqual(['Socks', 'Scarf'])
    expect(pieceEntries).toHaveLength(2)
    expect(mocks.homeSend).toHaveBeenCalledWith('knitting:changed', {})
    await expect(handler('knitting:removePiece')(admin, { id: 'not-an-id' })).rejects.toThrow()
  })

  it('keeps a piece whose photo is gone, with its caption and no picture', async () => {
    await addPiece('Scarf', 'Tom')
    await addPiece('Hat')
    pieceEntries.splice(0, 1)
    const [hat, scarf] = (await homeState()).pieces
    expect(hat!.url).toMatch(/^grammie-media:\/\/knitted\//)
    expect(scarf).toEqual({ id: expect.any(String), what: 'Scarf', forWhom: 'Tom' })
    gallery.list.mockRejectedValueOnce(new Error('EBUSY C:\\Users\\her\\media'))
    expect((await homeState()).pieces.every((piece) => piece.url === undefined)).toBe(true)
  })

  it('keeps her finished pieces when her project or patterns change', async () => {
    await addPiece('Scarf')
    await handler('knitting:saveProject')(admin, { name: 'Hat' })
    await addPattern('Hat', ['a1.png'])
    await handler('knitting:removeProject')(admin)
    expect((await adminState()).pieces).toHaveLength(1)
  })
})
