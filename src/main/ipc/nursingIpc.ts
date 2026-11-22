import { app, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import type { IpcResponse } from '@shared/ipcContract'
import { orderPagePaths } from '@shared/knitting/knitting'
import { PHOTO_EXTENSIONS } from '@shared/media/photoTypes'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import {
  MAX_NURSING_CHAPTERS,
  MAX_NURSING_PAGES,
  MAX_NURSING_PAPERS,
  NURSING_PAGE_EDGE,
  moveNursingItem,
  nursingChapterInputSchema,
  nursingForAdmin,
  nursingForHome,
  nursingMoveSchema,
  nursingPaperInputSchema,
  type AdminNursing,
  type NursingChapter,
  type NursingFile,
  type NursingPaper
} from '@shared/nursing/nursingHistory'
import { NursingStore } from '../services/nursing/nursingStore'
import {
  encodePicture,
  removePictures,
  type KnittingLibrary
} from '../services/knitting/knittingPictures'
import { createNativePhotoCodec } from '../services/photos/nativePhotoCodec'
import type { PhotoCodec } from '../services/photos/photoLibrary'
import type { RenderPdf } from '../services/ravelry/pdfPages'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'

/** A scanned paper is a few MB; anything this big is not one of her papers. */
const MAX_PDF_BYTES = 80_000_000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface NursingIpcOptions {
  /** The one shared store for the nursing media library (see registerLibraryIpc). */
  pages: () => KnittingLibrary
  /** Draws a picked PDF into page pictures; see services/ravelry/pdfPages.ts. */
  renderPdf?: RenderPdf
  folder?: () => string
  /** Where a drawn PDF page waits to be decoded. */
  temporaryFolder?: () => string
  codec?: () => PhotoCodec
  /** The native picker: pictures of the pages, or one PDF; null when cancelled. */
  pickPages?: () => Promise<string[] | null>
}

function requireHome(event: IpcMainInvokeEvent): void {
  if (
    event.sender !== getLauncherWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Home window required')
  }
}

function requireCaregiver(event: IpcMainInvokeEvent): void {
  requireAdminUnlocked()
  if (
    event.sender !== getAdminWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Caregiver window required')
  }
}

function knownId(value: unknown, what: string): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error(`Unknown ${what}`)
  return value
}

function findChapter(file: NursingFile, id: string): NursingChapter {
  const chapter = file.chapters.find((entry) => entry.id === id)
  if (!chapter) throw new Error('That chapter is no longer there. The list has been refreshed.')
  return chapter
}

function withChapter(
  file: NursingFile,
  id: string,
  change: (chapter: NursingChapter) => NursingChapter
): NursingFile {
  findChapter(file, id)
  return {
    ...file,
    chapters: file.chapters.map((chapter) => (chapter.id === id ? change(chapter) : chapter))
  }
}

/**
 * Home reads her nursing history; only the caregiver's admin tab changes it (TASK-94). Every
 * change goes through the store's queue, so a quick second click starts from the saved
 * history. Page pictures come only from the picker, re-encoded like her photos, and a page
 * is deleted only after the record that used it is saved without it.
 */
export function registerNursingIpc({
  pages,
  renderPdf = async () => {
    throw new Error('No PDF renderer')
  },
  folder = () => join(app.getPath('userData'), 'nursing'),
  temporaryFolder = () => app.getPath('temp'),
  codec = () => createNativePhotoCodec(nativeImage),
  pickPages = async () => {
    const selected = await dialog.showOpenDialog({
      title: 'Choose the pages of her paper',
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [
        { name: 'Pictures of the pages, or a PDF', extensions: [...PHOTO_EXTENSIONS, 'pdf'] }
      ]
    })
    return selected.canceled ? null : selected.filePaths
  }
}: NursingIpcOptions): void {
  // Lazy so registration itself never touches disk.
  let store: NursingStore | undefined
  const nursing = (): NursingStore =>
    (store ??= new NursingStore(folder(), (backupName) =>
      logReliabilityEvent({ op: 'nursing-reset', ok: false, detail: backupName })
    ))

  async function entries(): Promise<LibraryEntry[]> {
    try {
      return await pages().list()
    } catch {
      // Pages unreadable for now: the words still show, each page with its calm line.
      return []
    }
  }
  const forAdmin = async (file: NursingFile): Promise<AdminNursing> =>
    nursingForAdmin(file, await entries())

  ipcMain.handle('nursing:home', async (event): Promise<IpcResponse<'nursing:home'>> => {
    requireHome(event)
    // Content-free: never a chapter, a paper's title or her words.
    logActivity('nursing-history-opened')
    return nursingForHome(await nursing().read(), await entries())
  })

  ipcMain.handle('nursing:get', async (event): Promise<IpcResponse<'nursing:get'>> => {
    requireCaregiver(event)
    return forAdmin(await nursing().read())
  })

  ipcMain.handle(
    'nursing:saveChapter',
    async (event, value: unknown): Promise<IpcResponse<'nursing:saveChapter'>> => {
      requireCaregiver(event)
      const input = nursingChapterInputSchema.parse(value)
      const file = await nursing().update((current) => {
        const words = { title: input.title, years: input.years, story: input.story }
        if (input.id) return withChapter(current, input.id, (chapter) => ({ ...chapter, ...words }))
        if (current.chapters.length >= MAX_NURSING_CHAPTERS) {
          throw new Error(`Up to ${MAX_NURSING_CHAPTERS} chapters can be saved.`)
        }
        return {
          ...current,
          chapters: [...current.chapters, { id: randomUUID(), ...words, papers: [] }]
        }
      })
      logActivity(input.id ? 'nursing-chapter-saved' : 'nursing-chapter-added')
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'nursing:moveChapter',
    async (
      event,
      req: { id?: unknown; direction?: unknown }
    ): Promise<IpcResponse<'nursing:moveChapter'>> => {
      requireCaregiver(event)
      const id = knownId(req?.id, 'chapter')
      const direction = nursingMoveSchema.parse(req?.direction)
      const file = await nursing().update((current) => ({
        ...current,
        chapters: moveNursingItem(current.chapters, id, direction)
      }))
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'nursing:removeChapter',
    async (event, req: { id?: unknown }): Promise<IpcResponse<'nursing:removeChapter'>> => {
      requireCaregiver(event)
      const id = knownId(req?.id, 'chapter')
      let removed: NursingChapter | undefined
      // The record goes first: an interrupted removal leaves unused files, never a broken paper.
      const file = await nursing().update((current) => {
        removed = current.chapters.find((chapter) => chapter.id === id)
        if (!removed) return current
        return { ...current, chapters: current.chapters.filter((chapter) => chapter.id !== id) }
      })
      if (removed) {
        await removePictures(
          pages(),
          removed.papers.flatMap((paper) => paper.pages)
        )
        logActivity('nursing-chapter-removed')
      }
      return forAdmin(file)
    }
  )

  /** Pictures in file-name order; one unreadable picture is counted and skipped. */
  async function pagesFromPictures(
    paths: readonly string[],
    paperId: string
  ): Promise<{ added: string[]; failed: number }> {
    if (paths.length > MAX_NURSING_PAGES) {
      throw new Error(`Choose up to ${MAX_NURSING_PAGES} pages at a time.`)
    }
    const added: string[] = []
    let failed = 0
    for (const source of orderPagePaths(paths)) {
      try {
        const { jpeg, thumbnail } = await encodePicture(source, codec(), NURSING_PAGE_EDGE)
        added.push((await pages().addImage(jpeg, thumbnail, { paperId })).id)
      } catch {
        // Its name or path never goes back to admin.
        failed += 1
      }
      // Native decoding is synchronous; let IPC breathe between pages.
      await setImmediate()
    }
    return { added, failed }
  }

  /** Every page of one PDF, drawn in a locked-down window and re-encoded like a picture. */
  async function pagesFromPdf(path: string, paperId: string): Promise<string[]> {
    const added: string[] = []
    try {
      if ((await stat(path)).size > MAX_PDF_BYTES) throw new Error('PDF too large')
      const bytes = await readFile(path)
      await renderPdf(bytes, MAX_NURSING_PAGES, NURSING_PAGE_EDGE, async (rendered) => {
        const drawn = join(temporaryFolder(), `grammieguide-nursing-${randomUUID()}.jpg`)
        try {
          await writeFile(drawn, rendered, { flag: 'wx' })
          const { jpeg, thumbnail } = await encodePicture(drawn, codec(), NURSING_PAGE_EDGE)
          added.push((await pages().addImage(jpeg, thumbnail, { paperId })).id)
        } finally {
          await rm(drawn, { force: true }).catch(() => undefined)
        }
      })
      return added
    } catch (error) {
      await removePictures(pages(), added)
      // Only the error's kind is logged: a message can quote her file's path.
      logReliabilityEvent({
        op: 'nursing-pdf',
        ok: false,
        detail: error instanceof Error ? error.name : 'unknown'
      })
      throw new Error(
        `That PDF couldn't be turned into pages. It may be over ${MAX_NURSING_PAGES} pages or ` +
          'protected; try pictures of its pages instead.'
      )
    }
  }

  let addingPaper = false
  ipcMain.handle(
    'nursing:addPaper',
    async (event, value: unknown): Promise<IpcResponse<'nursing:addPaper'>> => {
      requireCaregiver(event)
      const input = nursingPaperInputSchema.parse(value)
      if (addingPaper) throw new Error('A paper is already being added.')
      addingPaper = true
      try {
        const room = (file: NursingFile): void => {
          if (findChapter(file, input.chapterId).papers.length >= MAX_NURSING_PAPERS) {
            throw new Error(`Up to ${MAX_NURSING_PAPERS} papers fit in one chapter.`)
          }
        }
        room(await nursing().read())
        const paths = await pickPages()
        // The lock or the window may have changed while the picker was open.
        requireCaregiver(event)
        if (!paths?.length) {
          return { nursing: await forAdmin(await nursing().read()), added: 0, failed: 0 }
        }
        const pdfs = paths.filter((path) => extname(path).toLowerCase() === '.pdf')
        if (pdfs.length && paths.length > 1) {
          throw new Error('Choose one PDF on its own, or pictures of the pages.')
        }
        const id = randomUUID()
        const { added, failed } = pdfs[0]
          ? { added: await pagesFromPdf(pdfs[0], id), failed: 0 }
          : await pagesFromPictures(paths, id)
        if (!added.length) throw new Error('None of those pictures could be read as pages.')
        let file: NursingFile
        try {
          requireCaregiver(event)
          file = await nursing().update((current) => {
            room(current)
            const paper: NursingPaper = { id, title: input.title, note: input.note, pages: added }
            return withChapter(current, input.chapterId, (chapter) => ({
              ...chapter,
              papers: [...chapter.papers, paper]
            }))
          })
        } catch (error) {
          // Pages with no paper record would be unreachable files; take them back out.
          await removePictures(pages(), added)
          throw error
        }
        logActivity('nursing-paper-added')
        return { nursing: await forAdmin(file), added: added.length, failed }
      } finally {
        addingPaper = false
      }
    }
  )

  ipcMain.handle(
    'nursing:savePaper',
    async (event, value: unknown): Promise<IpcResponse<'nursing:savePaper'>> => {
      requireCaregiver(event)
      const input = nursingPaperInputSchema.parse(value)
      const paperId = knownId(input.id, 'paper')
      const file = await nursing().update((current) =>
        withChapter(current, input.chapterId, (chapter) => {
          if (!chapter.papers.some((paper) => paper.id === paperId)) {
            throw new Error('That paper is no longer there. The list has been refreshed.')
          }
          return {
            ...chapter,
            papers: chapter.papers.map((paper) =>
              paper.id === paperId ? { ...paper, title: input.title, note: input.note } : paper
            )
          }
        })
      )
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'nursing:movePaper',
    async (
      event,
      req: { chapterId?: unknown; id?: unknown; direction?: unknown }
    ): Promise<IpcResponse<'nursing:movePaper'>> => {
      requireCaregiver(event)
      const chapterId = knownId(req?.chapterId, 'chapter')
      const id = knownId(req?.id, 'paper')
      const direction = nursingMoveSchema.parse(req?.direction)
      const file = await nursing().update((current) =>
        withChapter(current, chapterId, (chapter) => ({
          ...chapter,
          papers: moveNursingItem(chapter.papers, id, direction)
        }))
      )
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'nursing:removePaper',
    async (
      event,
      req: { chapterId?: unknown; id?: unknown }
    ): Promise<IpcResponse<'nursing:removePaper'>> => {
      requireCaregiver(event)
      const chapterId = knownId(req?.chapterId, 'chapter')
      const id = knownId(req?.id, 'paper')
      let removed: NursingPaper | undefined
      const file = await nursing().update((current) => {
        const chapter = current.chapters.find((entry) => entry.id === chapterId)
        removed = chapter?.papers.find((paper) => paper.id === id)
        if (!removed) return current
        return withChapter(current, chapterId, (entry) => ({
          ...entry,
          papers: entry.papers.filter((paper) => paper.id !== id)
        }))
      })
      if (removed) {
        await removePictures(pages(), removed.pages)
        logActivity('nursing-paper-removed')
      }
      return forAdmin(file)
    }
  )
}
