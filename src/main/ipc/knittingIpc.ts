import { app, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcResponse } from '@shared/ipcContract'
import {
  MAX_KNITTING_PATTERNS,
  changeRows,
  knittingProjectInputSchema,
  patternNameSchema,
  type AdminKnitting,
  type HomeKnitting,
  type KnittingFile,
  type KnittingPattern
} from '@shared/knitting/knitting'
import { PHOTO_EXTENSIONS } from '@shared/media/photoTypes'
import { isSafeMediaFileName } from '@shared/media/mediaPath'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import { KnittingStore } from '../services/knitting/knittingStore'
import {
  importPatternPages,
  removePatternPages,
  type PatternLibrary
} from '../services/knitting/knittingPatterns'
import { createNativePhotoCodec } from '../services/photos/nativePhotoCodec'
import type { PhotoCodec } from '../services/photos/photoLibrary'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'

export type KnittingPhoto = { url: string; thumbnailUrl: string }

export interface KnittingIpcOptions {
  /** The one shared store for the patterns media library (see registerLibraryIpc). */
  patterns: () => PatternLibrary
  photo?: (id: string | undefined) => Promise<KnittingPhoto | undefined>
  folder?: () => string
  now?: () => number
  codec?: () => PhotoCodec
  /** The native picker; null when the caregiver cancels. */
  pickPages?: () => Promise<string[] | null>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireCaregiver(event: IpcMainInvokeEvent): void {
  requireAdminUnlocked()
  if (
    event.sender !== getAdminWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Caregiver window required')
  }
}

function requireHome(event: IpcMainInvokeEvent): void {
  if (
    event.sender !== getLauncherWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Home window required')
  }
}

function mediaUrl(fileName: string | undefined): string | undefined {
  return fileName && isSafeMediaFileName(fileName)
    ? `grammie-media://patterns/${fileName}`
    : undefined
}

/**
 * Logs say that the counter, a pattern or the project changed, never what she is
 * making, who it is for or a pattern's name: those are family details, and the
 * activity log reaches admin.
 */
export function registerKnittingIpc({
  patterns,
  photo = async () => undefined,
  folder = () => join(app.getPath('userData'), 'knitting'),
  now = Date.now,
  codec = () => createNativePhotoCodec(nativeImage),
  pickPages = async () => {
    const selected = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [{ name: 'Pattern pages', extensions: [...PHOTO_EXTENSIONS] }]
    })
    return selected.canceled ? null : selected.filePaths
  }
}: KnittingIpcOptions): void {
  // Lazy so registration itself never touches disk.
  let store: KnittingStore | undefined
  const knitting = (): KnittingStore =>
    (store ??= new KnittingStore(folder(), (backupName) =>
      logReliabilityEvent({ op: 'knitting-reset', ok: false, detail: backupName })
    ))

  const pageEntries = async (): Promise<Map<string, LibraryEntry>> => {
    // An unreadable library shows each page's calm missing line, never an error on Home.
    const entries: LibraryEntry[] = await patterns()
      .list()
      .catch(() => [])
    return new Map(entries.map((entry) => [entry.id, entry] as const))
  }
  const linkedPattern = (file: KnittingFile): string | undefined => {
    const id = file.project?.patternId
    return id && file.patterns.some((pattern) => pattern.id === id) ? id : undefined
  }

  const forHome = async (file: KnittingFile): Promise<HomeKnitting> => {
    const project = file.project
    const entries = file.patterns.length ? await pageEntries() : new Map<string, LibraryEntry>()
    const patternsForHome = file.patterns.map((pattern) => {
      const first = entries.get(pattern.pages[0]!)
      return {
        id: pattern.id,
        name: pattern.name,
        lastPage: pattern.lastPage,
        ...(first && { thumbnailUrl: mediaUrl(first.thumbFileName ?? first.fileName) }),
        pages: pattern.pages.map((id) => ({ url: mediaUrl(entries.get(id)?.fileName) }))
      }
    })
    if (!project) return { project: null, patterns: patternsForHome }
    // A photo removed from the library just leaves the yarn icon in its place.
    const picture = await photo(project.photoId).catch(() => undefined)
    const patternId = linkedPattern(file)
    return {
      project: {
        name: project.name,
        forWhom: project.forWhom,
        rows: project.rows,
        ...(picture && { photoUrl: picture.url, thumbnailUrl: picture.thumbnailUrl }),
        ...(patternId && { patternId })
      },
      patterns: patternsForHome
    }
  }

  const forAdmin = async (file: KnittingFile): Promise<AdminKnitting> => {
    const project = file.project
    const entries = file.patterns.length ? await pageEntries() : new Map<string, LibraryEntry>()
    return {
      project: project && {
        name: project.name,
        forWhom: project.forWhom,
        photoId: project.photoId,
        patternId: linkedPattern(file),
        rows: project.rows
      },
      patterns: file.patterns.map((pattern) => {
        const first = entries.get(pattern.pages[0]!)
        return {
          id: pattern.id,
          name: pattern.name,
          pageCount: pattern.pages.length,
          ...(first && { thumbnailUrl: mediaUrl(first.thumbFileName ?? first.fileName) })
        }
      })
    }
  }

  const announce = (): void => {
    for (const window of [getLauncherWindow(), getAdminWindow()]) {
      try {
        window?.webContents.send('knitting:changed', {})
      } catch {
        // The change is saved; a window that missed this reads it again when it opens.
      }
    }
  }

  ipcMain.handle('knitting:home', async (event): Promise<IpcResponse<'knitting:home'>> => {
    requireHome(event)
    return forHome(await knitting().read())
  })

  ipcMain.handle(
    'knitting:changeRows',
    async (event, req: { direction?: unknown }): Promise<IpcResponse<'knitting:changeRows'>> => {
      requireHome(event)
      const direction = req?.direction
      if (direction !== 'add' && direction !== 'remove') throw new Error('Unknown row change')
      let changed = false
      const file = await knitting().update((current) => {
        if (!current.project) return current
        const project = changeRows(current.project, direction, now())
        if (project === current.project) return current
        changed = true
        return { ...current, project }
      })
      if (changed) {
        logActivity(direction === 'add' ? 'knitting-row-added' : 'knitting-row-removed')
        announce()
      }
      return forHome(file)
    }
  )

  ipcMain.handle(
    'knitting:patternPage',
    async (
      event,
      req: { patternId?: unknown; page?: unknown }
    ): Promise<IpcResponse<'knitting:patternPage'>> => {
      requireHome(event)
      const { patternId, page } = req ?? {}
      if (typeof patternId !== 'string' || !Number.isSafeInteger(page) || (page as number) < 0) {
        throw new Error('Unknown pattern page')
      }
      // Only remembered, not announced: Home already shows the page, and admin doesn't.
      await knitting().update((current) => {
        const pattern = current.patterns.find((item) => item.id === patternId)
        if (!pattern) return current
        const lastPage = Math.min(page as number, pattern.pages.length - 1)
        if (lastPage === pattern.lastPage) return current
        return {
          ...current,
          patterns: current.patterns.map((item) =>
            item.id === patternId ? { ...item, lastPage } : item
          )
        }
      })
    }
  )

  ipcMain.handle('knitting:get', async (event): Promise<IpcResponse<'knitting:get'>> => {
    requireCaregiver(event)
    return forAdmin(await knitting().read())
  })

  ipcMain.handle(
    'knitting:saveProject',
    async (event, value: unknown): Promise<IpcResponse<'knitting:saveProject'>> => {
      requireCaregiver(event)
      const input = knittingProjectInputSchema.parse(value)
      const file = await knitting().update((current) => {
        const keep = current.project && !input.startNew ? current.project : undefined
        const patternId =
          input.patternId && current.patterns.some((pattern) => pattern.id === input.patternId)
            ? input.patternId
            : undefined
        return {
          ...current,
          project: {
            id: keep?.id ?? randomUUID(),
            name: input.name,
            forWhom: input.forWhom,
            ...(input.photoId && { photoId: input.photoId }),
            ...(patternId && { patternId }),
            rows: keep?.rows ?? 0,
            ...(keep?.lastChange && { lastChange: keep.lastChange })
          }
        }
      })
      logActivity(input.startNew ? 'knitting-project-started' : 'knitting-project-saved')
      announce()
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'knitting:resetRows',
    async (event): Promise<IpcResponse<'knitting:resetRows'>> => {
      requireCaregiver(event)
      const file = await knitting().update((current) =>
        current.project
          ? { ...current, project: { ...current.project, rows: 0, lastChange: undefined } }
          : current
      )
      logActivity('knitting-rows-reset')
      announce()
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'knitting:removeProject',
    async (event): Promise<IpcResponse<'knitting:removeProject'>> => {
      requireCaregiver(event)
      // Patterns stay: they belong to her, not to one project.
      const file = await knitting().update((current) =>
        current.project ? { ...current, project: null } : current
      )
      logActivity('knitting-project-removed')
      announce()
      return forAdmin(file)
    }
  )

  let addingPattern = false
  ipcMain.handle(
    'knitting:addPattern',
    async (event, req: { name?: unknown }): Promise<IpcResponse<'knitting:addPattern'>> => {
      requireCaregiver(event)
      const name = patternNameSchema.parse(req?.name)
      if (addingPattern) throw new Error('Pattern pages are already being added.')
      addingPattern = true
      try {
        if ((await knitting().read()).patterns.length >= MAX_KNITTING_PATTERNS) {
          throw new Error(`Up to ${MAX_KNITTING_PATTERNS} patterns can be saved.`)
        }
        const paths = await pickPages()
        // The lock or the window may have changed while the picker was open.
        requireCaregiver(event)
        if (!paths?.length) {
          return { knitting: await forAdmin(await knitting().read()), added: 0, failed: 0 }
        }
        const id = randomUUID()
        const { pages, failed } = await importPatternPages(paths, patterns(), codec(), id)
        if (!pages.length) throw new Error('None of those pictures could be read as pages.')
        let file: KnittingFile
        try {
          requireCaregiver(event)
          file = await knitting().update((current) => {
            if (current.patterns.length >= MAX_KNITTING_PATTERNS) {
              throw new Error(`Up to ${MAX_KNITTING_PATTERNS} patterns can be saved.`)
            }
            const pattern: KnittingPattern = { id, name, pages, lastPage: 0 }
            return { ...current, patterns: [...current.patterns, pattern] }
          })
        } catch (error) {
          // Pages with no pattern record would be unreachable files; take them back out.
          await removePatternPages(patterns(), pages)
          throw error
        }
        logActivity('knitting-pattern-added')
        announce()
        return { knitting: await forAdmin(file), added: pages.length, failed }
      } finally {
        addingPattern = false
      }
    }
  )

  ipcMain.handle(
    'knitting:removePattern',
    async (event, req: { id?: unknown }): Promise<IpcResponse<'knitting:removePattern'>> => {
      requireCaregiver(event)
      const id = req?.id
      if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Unknown pattern')
      let removed: KnittingPattern | undefined
      // The record goes first: an interrupted removal leaves unused files, never a broken pattern.
      const file = await knitting().update((current) => {
        removed = current.patterns.find((pattern) => pattern.id === id)
        if (!removed) return current
        const project =
          current.project?.patternId === id
            ? { ...current.project, patternId: undefined }
            : current.project
        return {
          ...current,
          project,
          patterns: current.patterns.filter((pattern) => pattern.id !== id)
        }
      })
      if (removed) {
        await removePatternPages(patterns(), removed.pages)
        logActivity('knitting-pattern-removed')
        announce()
      }
      return forAdmin(file)
    }
  )
}
