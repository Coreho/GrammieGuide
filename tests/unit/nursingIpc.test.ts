import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LibraryEntry, LibraryMetadata } from '../../src/shared/media/libraryTypes'
import type { PhotoCodec, PhotoImage } from '../../src/main/services/photos/photoLibrary'
import type {
  AdminNursing,
  HomeNursing,
  NursingPaperImportResult
} from '../../src/shared/nursing/nursingHistory'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  admin: { webContents: { mainFrame: {} } },
  home: { webContents: { mainFrame: {} } }
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  app: { getPath: () => '' },
  dialog: {},
  nativeImage: {}
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({
  logReliabilityEvent: vi.fn()
}))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
import { registerNursingIpc } from '../../src/main/ipc/nursingIpc'

const home = { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame }
const admin = { sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame }

function page(): PhotoImage {
  const image: PhotoImage = {
    isEmpty: () => false,
    getSize: () => ({ width: 1000, height: 1300 }),
    resize: () => image,
    toJPEG: () => Buffer.from('jpeg')
  }
  return image
}
const codec: PhotoCodec = {
  createFromPath: (path: string) => {
    if (path.includes('broken')) throw new Error('unreadable')
    return page()
  }
}

let folder: string
let picked: string[] | null
let entries: LibraryEntry[]
let pdfPages: number
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
const call = async (channel: string, request?: unknown): Promise<AdminNursing> =>
  (await handler(channel)(admin, request)) as AdminNursing
const addChapter = (title: string, years = ''): Promise<AdminNursing> =>
  call('nursing:saveChapter', { title, years, story: '' })
const addPaper = async (
  chapterId: string,
  title: string,
  paths: string[]
): Promise<NursingPaperImportResult> => {
  picked = paths
  return (await handler('nursing:addPaper')(admin, {
    chapterId,
    title,
    note: 'Her own paper'
  })) as NursingPaperImportResult
}

beforeEach(() => {
  vi.clearAllMocks()
  folder = mkdtempSync(join(tmpdir(), 'grammieguide-nursing-ipc-'))
  picked = null
  entries = []
  pdfPages = 3
  registerNursingIpc({
    pages: () => library,
    folder: () => folder,
    temporaryFolder: () => folder,
    codec: () => codec,
    pickPages: async () => picked,
    renderPdf: async (_bytes, maxPages, _edge, onPage) => {
      if (pdfPages > maxPages) throw new Error('too long')
      for (let index = 0; index < pdfPages; index += 1) await onPage(Buffer.from('drawn'))
    }
  })
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('nursing IPC: the caregiver edits her history', () => {
  it('adds, saves, orders and removes chapters', async () => {
    await addChapter('Nursing school', '1960s')
    let nursing = await addChapter('Columbia Presbyterian', '1967 - 1999')
    expect(nursing.chapters.map((chapter) => chapter.title)).toEqual([
      'Nursing school',
      'Columbia Presbyterian'
    ])
    const [school, columbia] = nursing.chapters
    nursing = await call('nursing:saveChapter', {
      id: school!.id,
      title: '  Bermuda and nursing school ',
      years: '1950s - 1967',
      story: 'You trained in Bermuda.'
    })
    expect(nursing.chapters[0]).toMatchObject({
      id: school!.id,
      title: 'Bermuda and nursing school',
      years: '1950s - 1967',
      story: 'You trained in Bermuda.'
    })
    nursing = await call('nursing:moveChapter', { id: columbia!.id, direction: 'earlier' })
    expect(nursing.chapters.map((chapter) => chapter.id)).toEqual([columbia!.id, school!.id])
    nursing = await call('nursing:removeChapter', { id: columbia!.id })
    expect(nursing.chapters.map((chapter) => chapter.id)).toEqual([school!.id])
  })

  it('refuses a blank title and an unknown chapter without changing anything', async () => {
    const before = await addChapter('Teaching')
    await expect(addChapter('   ')).rejects.toThrow()
    await expect(
      call('nursing:saveChapter', { id: randomUUID(), title: 'Gone', story: '' })
    ).rejects.toThrow('no longer there')
    expect(await call('nursing:get')).toEqual(before)
  })

  it('adds a paper from pictures in file-name order, skipping one it cannot read', async () => {
    const chapterId = (await addChapter('Teaching')).chapters[0]!.id
    const result = await addPaper(chapterId, 'Final exam', [
      'C:\\scans\\page10.jpg',
      'C:\\scans\\broken.png',
      'C:\\scans\\page2.jpg'
    ])
    expect(result).toMatchObject({ added: 2, failed: 1 })
    const paper = result.nursing.chapters[0]!.papers[0]!
    expect(paper).toMatchObject({ title: 'Final exam', note: 'Her own paper', pageCount: 2 })
    expect(paper.missingPages).toBe(0)
    // The cover is the first page's small picture.
    expect(paper.cover).toBe(`grammie-media://nursing/${entries[0]!.thumbFileName}`)

    const shown = (await handler('nursing:home')(home)) as HomeNursing
    expect(shown.chapters[0]!.papers[0]!.pages).toEqual(
      entries.map((entry) => `grammie-media://nursing/${entry.fileName}`)
    )
  })

  it('adds a paper from one PDF, page by page', async () => {
    const chapterId = (await addChapter('Walden')).chapters[0]!.id
    const pdf = join(folder, 'paper.pdf')
    await import('node:fs/promises').then((fs) => fs.writeFile(pdf, 'pdf'))
    const result = await addPaper(chapterId, 'Portfolio', [pdf])
    expect(result.added).toBe(3)
    expect(entries).toHaveLength(3)
  })

  it('takes back every drawn page when a PDF fails, and refuses a PDF mixed with pictures', async () => {
    const chapterId = (await addChapter('Walden')).chapters[0]!.id
    const pdf = join(folder, 'long.pdf')
    await import('node:fs/promises').then((fs) => fs.writeFile(pdf, 'pdf'))
    pdfPages = 500
    await expect(addPaper(chapterId, 'Too long', [pdf])).rejects.toThrow(
      "couldn't be turned into pages"
    )
    await expect(addPaper(chapterId, 'Mixed', [pdf, 'C:\\a.jpg'])).rejects.toThrow(
      'Choose one PDF on its own'
    )
    expect(entries).toEqual([])
    expect((await call('nursing:get')).chapters[0]!.papers).toEqual([])
  })

  it('changes nothing when the picker is cancelled', async () => {
    const chapterId = (await addChapter('Teaching')).chapters[0]!.id
    const result = await addPaper(chapterId, 'Nothing', [])
    expect(result.added).toBe(0)
    expect(result.nursing.chapters[0]!.papers).toEqual([])
  })

  it('renames, orders and removes papers, deleting a removed paper’s pages', async () => {
    const chapterId = (await addChapter('Teaching')).chapters[0]!.id
    await addPaper(chapterId, 'Course outline', ['C:\\a1.jpg', 'C:\\a2.jpg'])
    const two = await addPaper(chapterId, 'Final exam', ['C:\\b1.jpg'])
    const [outline, exam] = two.nursing.chapters[0]!.papers
    let nursing = await call('nursing:savePaper', {
      chapterId,
      id: exam!.id,
      title: 'Nursing 132 final exam',
      note: 'For her students'
    })
    expect(nursing.chapters[0]!.papers[1]).toMatchObject({
      title: 'Nursing 132 final exam',
      note: 'For her students'
    })
    nursing = await call('nursing:movePaper', { chapterId, id: exam!.id, direction: 'earlier' })
    expect(nursing.chapters[0]!.papers.map((paper) => paper.id)).toEqual([exam!.id, outline!.id])
    nursing = await call('nursing:removePaper', { chapterId, id: outline!.id })
    expect(nursing.chapters[0]!.papers.map((paper) => paper.id)).toEqual([exam!.id])
    expect(entries).toHaveLength(1)
    // Removing the chapter deletes the rest of its pages too.
    await call('nursing:removeChapter', { id: chapterId })
    expect(entries).toEqual([])
  })

  it('counts a paper’s missing pages for the caregiver', async () => {
    const chapterId = (await addChapter('Teaching')).chapters[0]!.id
    await addPaper(chapterId, 'Outline', ['C:\\a1.jpg', 'C:\\a2.jpg'])
    entries = entries.slice(0, 1)
    expect((await call('nursing:get')).chapters[0]!.papers[0]!.missingPages).toBe(1)
  })

  it.each([
    'nursing:get',
    'nursing:saveChapter',
    'nursing:moveChapter',
    'nursing:removeChapter',
    'nursing:addPaper',
    'nursing:savePaper',
    'nursing:movePaper',
    'nursing:removePaper'
  ])('refuses Home and a locked admin for %s', async (channel) => {
    const request = { id: randomUUID(), chapterId: randomUUID(), title: 'x', direction: 'later' }
    await expect(handler(channel)(home, request)).rejects.toThrow('Caregiver window required')
    mocks.unlocked.mockImplementationOnce(() => {
      throw new Error('admin unlock required')
    })
    await expect(handler(channel)(admin, request)).rejects.toThrow('admin unlock required')
  })

  it('refuses the caregiver window for Home’s read', async () => {
    await expect(handler('nursing:home')(admin)).rejects.toThrow('Home window required')
  })
})
