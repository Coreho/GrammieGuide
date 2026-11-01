import { app, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcResponse } from '@shared/ipcContract'
import {
  MAX_KNITTING_PATTERNS,
  MAX_KNITTING_PIECES,
  PIECE_PICTURE_EDGE,
  changeRows,
  knittingPieceInputSchema,
  knittingProjectInputSchema,
  movePiece,
  patternNameSchema,
  type AdminKnitting,
  type HomeKnitting,
  type KnittingFile,
  type KnittingPattern,
  type KnittingPiece
} from '@shared/knitting/knitting'
import {
  MAX_RAVELRY_PATTERNS,
  parseRavelryPatternPage,
  type RavelryPattern,
  type RavelryPatternDetails,
  type RavelrySaveResult
} from '@shared/knitting/ravelry'
import { PHOTO_EXTENSIONS } from '@shared/media/photoTypes'
import { isSafeMediaFileName } from '@shared/media/mediaPath'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import { KnittingStore } from '../services/knitting/knittingStore'
import { importPatternPages } from '../services/knitting/knittingPatterns'
import {
  encodePicture,
  removePictures,
  type KnittingLibrary
} from '../services/knitting/knittingPictures'
import { createNativePhotoCodec } from '../services/photos/nativePhotoCodec'
import type { PhotoCodec } from '../services/photos/photoLibrary'
import type { RenderPdf } from '../services/ravelry/pdfPages'
import {
  importRavelryInstructions,
  importRavelryPictures
} from '../services/ravelry/ravelryPictures'
import type { RavelrySource } from '../services/ravelry/ravelryService'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'

export type KnittingPhoto = { url: string; thumbnailUrl: string }

export interface KnittingIpcOptions {
  /** The one shared store for the patterns media library (see registerLibraryIpc). */
  patterns: () => KnittingLibrary
  /** The one shared store for the knitted media library: photos of her finished pieces. */
  gallery: () => KnittingLibrary
  /** The one shared store for the ravelry media library: saved pictures of her picked patterns. */
  ravelryPictures: () => KnittingLibrary
  ravelry: () => RavelrySource
  /** Draws a saved pattern's PDF into pages; see services/ravelry/pdfPages.ts. */
  ravelryPdf?: RenderPdf
  /** Whether main served this pattern to her, so Home can't save an arbitrary ID. */
  ravelryServed?: (ravelryId: number) => boolean
  /** The address of the embedded page she is on, or null. */
  currentPage?: () => string | null
  photo?: (id: string | undefined) => Promise<KnittingPhoto | undefined>
  folder?: () => string
  /** Where a downloaded picture waits to be decoded. */
  temporaryFolder?: () => string
  now?: () => number
  codec?: () => PhotoCodec
  /** The native pickers; null when the caregiver cancels. */
  pickPages?: () => Promise<string[] | null>
  pickPicture?: () => Promise<string | null>
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

type KnittingMedia = 'patterns' | 'knitted' | 'ravelry'

function mediaUrl(library: KnittingMedia, fileName: string | undefined): string | undefined {
  return fileName && isSafeMediaFileName(fileName)
    ? `grammie-media://${library}/${fileName}`
    : undefined
}

/**
 * Logs say that the counter, a pattern, a piece or the project changed, never what
 * she is making or made, who it is for or a pattern's name: those are family
 * details, and the activity log reaches admin.
 */
export function registerKnittingIpc({
  patterns,
  gallery,
  ravelryPictures,
  ravelry,
  ravelryPdf = async () => {
    throw new Error('No PDF renderer')
  },
  ravelryServed = () => false,
  currentPage = () => null,
  photo = async () => undefined,
  folder = () => join(app.getPath('userData'), 'knitting'),
  temporaryFolder = () => app.getPath('temp'),
  now = Date.now,
  codec = () => createNativePhotoCodec(nativeImage),
  pickPages = async () => {
    const selected = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [{ name: 'Pattern pages', extensions: [...PHOTO_EXTENSIONS] }]
    })
    return selected.canceled ? null : selected.filePaths
  },
  pickPicture = async () => {
    const selected = await dialog.showOpenDialog({
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: 'Photos', extensions: [...PHOTO_EXTENSIONS] }]
    })
    return selected.canceled ? null : (selected.filePaths[0] ?? null)
  }
}: KnittingIpcOptions): void {
  // Lazy so registration itself never touches disk.
  let store: KnittingStore | undefined
  const knitting = (): KnittingStore =>
    (store ??= new KnittingStore(folder(), (backupName) =>
      logReliabilityEvent({ op: 'knitting-reset', ok: false, detail: backupName })
    ))

  const entriesOf = async (
    library: KnittingLibrary,
    wanted: boolean
  ): Promise<Map<string, LibraryEntry>> => {
    if (!wanted) return new Map()
    // An unreadable library shows each picture's calm missing line, never an error on Home.
    const entries: LibraryEntry[] = await library.list().catch(() => [])
    return new Map(entries.map((entry) => [entry.id, entry] as const))
  }
  const pageEntries = (file: KnittingFile): Promise<Map<string, LibraryEntry>> =>
    entriesOf(patterns(), file.patterns.length > 0)
  const pieceEntries = (file: KnittingFile): Promise<Map<string, LibraryEntry>> =>
    entriesOf(gallery(), file.pieces.length > 0)
  const ravelryEntries = (file: KnittingFile): Promise<Map<string, LibraryEntry>> =>
    entriesOf(ravelryPictures(), file.ravelry.length > 0)
  const thumbnail = (
    library: KnittingMedia,
    entry: LibraryEntry | undefined
  ): { thumbnailUrl?: string } =>
    entry ? { thumbnailUrl: mediaUrl(library, entry.thumbFileName ?? entry.fileName) } : {}
  const linkedPattern = (file: KnittingFile): string | undefined => {
    const id = file.project?.patternId
    return id && file.patterns.some((pattern) => pattern.id === id) ? id : undefined
  }

  const forHome = async (file: KnittingFile): Promise<HomeKnitting> => {
    const project = file.project
    const [pages, pictures, saved] = await Promise.all([
      pageEntries(file),
      pieceEntries(file),
      ravelryEntries(file)
    ])
    const ravelryForHome = file.ravelry.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      designer: pattern.designer,
      facts: pattern.facts,
      notes: pattern.notes,
      ...thumbnail('ravelry', saved.get(pattern.pictures[0] ?? '')),
      pictures: pattern.pictures.map((id) => ({
        url: mediaUrl('ravelry', saved.get(id)?.fileName)
      })),
      ravelryId: pattern.ravelryId,
      pages: pattern.pages.map((id) => ({ url: mediaUrl('ravelry', saved.get(id)?.fileName) })),
      lastPage: pattern.lastPage
    }))
    let ravelryFind = false
    try {
      ravelryFind = ravelry().status().connected
    } catch {
      // Without a readable key she simply isn't offered Find a pattern.
    }
    const patternsForHome = file.patterns.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      lastPage: pattern.lastPage,
      ...thumbnail('patterns', pages.get(pattern.pages[0]!)),
      pages: pattern.pages.map((id) => ({ url: mediaUrl('patterns', pages.get(id)?.fileName) }))
    }))
    const piecesForHome = file.pieces.map((piece) => {
      const entry = pictures.get(piece.picture)
      return {
        id: piece.id,
        what: piece.what,
        forWhom: piece.forWhom,
        ...(entry && { url: mediaUrl('knitted', entry.fileName) }),
        ...thumbnail('knitted', entry)
      }
    })
    if (!project) {
      return {
        project: null,
        patterns: patternsForHome,
        pieces: piecesForHome,
        ravelry: ravelryForHome,
        ravelryFind
      }
    }
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
      patterns: patternsForHome,
      pieces: piecesForHome,
      ravelry: ravelryForHome,
      ravelryFind
    }
  }

  const forAdmin = async (file: KnittingFile): Promise<AdminKnitting> => {
    const project = file.project
    const [pages, pictures, saved] = await Promise.all([
      pageEntries(file),
      pieceEntries(file),
      ravelryEntries(file)
    ])
    return {
      project: project && {
        name: project.name,
        forWhom: project.forWhom,
        photoId: project.photoId,
        patternId: linkedPattern(file),
        rows: project.rows
      },
      patterns: file.patterns.map((pattern) => ({
        id: pattern.id,
        name: pattern.name,
        pageCount: pattern.pages.length,
        ...thumbnail('patterns', pages.get(pattern.pages[0]!))
      })),
      pieces: file.pieces.map((piece) => ({
        id: piece.id,
        what: piece.what,
        forWhom: piece.forWhom,
        ...thumbnail('knitted', pictures.get(piece.picture))
      })),
      ravelry: file.ravelry.map((pattern) => ({
        id: pattern.id,
        ravelryId: pattern.ravelryId,
        name: pattern.name,
        designer: pattern.designer,
        ...thumbnail('ravelry', saved.get(pattern.pictures[0] ?? '')),
        pageCount: pattern.pages.length
      }))
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
        const saved = current.ravelry.find((item) => item.id === patternId)
        if (saved) {
          const lastPage = Math.min(page as number, Math.max(0, saved.pages.length - 1))
          if (lastPage === saved.lastPage) return current
          return {
            ...current,
            ravelry: current.ravelry.map((item) =>
              item.id === patternId ? { ...item, lastPage } : item
            )
          }
        }
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
          await removePictures(patterns(), pages)
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
        await removePictures(patterns(), removed.pages)
        logActivity('knitting-pattern-removed')
        announce()
      }
      return forAdmin(file)
    }
  )

  let addingPiece = false
  ipcMain.handle(
    'knitting:addPiece',
    async (event, value: unknown): Promise<IpcResponse<'knitting:addPiece'>> => {
      requireCaregiver(event)
      const input = knittingPieceInputSchema.parse(value)
      if (addingPiece) throw new Error('A photo is already being added.')
      addingPiece = true
      try {
        if ((await knitting().read()).pieces.length >= MAX_KNITTING_PIECES) {
          throw new Error(`Up to ${MAX_KNITTING_PIECES} pieces can be saved.`)
        }
        const source = await pickPicture()
        // The lock or the window may have changed while the picker was open.
        requireCaregiver(event)
        if (!source) return { knitting: await forAdmin(await knitting().read()), added: false }
        const id = randomUUID()
        let encoded: { jpeg: Buffer; thumbnail: Buffer }
        try {
          encoded = await encodePicture(source, codec(), PIECE_PICTURE_EDGE)
        } catch {
          throw new Error("That photo couldn't be read. Try a JPEG or PNG photo.")
        }
        let picture: string
        try {
          picture = (await gallery().addImage(encoded.jpeg, encoded.thumbnail, { pieceId: id })).id
        } catch {
          // The store's errors can name userData paths.
          throw new Error('Could not save the photo. Try again.')
        }
        let file: KnittingFile
        try {
          requireCaregiver(event)
          file = await knitting().update((current) => {
            if (current.pieces.length >= MAX_KNITTING_PIECES) {
              throw new Error(`Up to ${MAX_KNITTING_PIECES} pieces can be saved.`)
            }
            const piece: KnittingPiece = { id, what: input.what, forWhom: input.forWhom, picture }
            // Newest first: what she made last is what she'll want to show.
            return { ...current, pieces: [piece, ...current.pieces] }
          })
        } catch (error) {
          // A photo with no piece record would be an unreachable file; take it back out.
          await removePictures(gallery(), [picture])
          throw error
        }
        logActivity('knitting-piece-added')
        announce()
        return { knitting: await forAdmin(file), added: true }
      } finally {
        addingPiece = false
      }
    }
  )

  ipcMain.handle(
    'knitting:movePiece',
    async (
      event,
      req: { id?: unknown; direction?: unknown }
    ): Promise<IpcResponse<'knitting:movePiece'>> => {
      requireCaregiver(event)
      const { id, direction } = req ?? {}
      if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Unknown piece')
      if (direction !== 'earlier' && direction !== 'later') throw new Error('Unknown move')
      let moved = false
      const file = await knitting().update((current) => {
        const pieces = movePiece(current.pieces, id, direction)
        if (pieces === current.pieces) return current
        moved = true
        return { ...current, pieces }
      })
      if (moved) {
        logActivity('knitting-piece-moved')
        announce()
      }
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'knitting:removePiece',
    async (event, req: { id?: unknown }): Promise<IpcResponse<'knitting:removePiece'>> => {
      requireCaregiver(event)
      const id = req?.id
      if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Unknown piece')
      let removed: KnittingPiece | undefined
      // The record goes first: an interrupted removal leaves an unused file, never a broken piece.
      const file = await knitting().update((current) => {
        removed = current.pieces.find((piece) => piece.id === id)
        if (!removed) return current
        return { ...current, pieces: current.pieces.filter((piece) => piece.id !== id) }
      })
      if (removed) {
        await removePictures(gallery(), [removed.picture])
        logActivity('knitting-piece-removed')
        announce()
      }
      return forAdmin(file)
    }
  )

  const alreadySaved = (current: KnittingFile, ravelryId: number): void => {
    if (current.ravelry.some((pattern) => pattern.ravelryId === ravelryId)) {
      throw new Error('That pattern is already on her shelf.')
    }
    if (current.ravelry.length >= MAX_RAVELRY_PATTERNS) {
      throw new Error(`Up to ${MAX_RAVELRY_PATTERNS} Ravelry patterns can be saved.`)
    }
  }

  let addingRavelry = false
  const logRavelry = (detail: string): void => {
    logReliabilityEvent({ op: 'ravelry-instructions', ok: false, detail })
  }

  /** The caregiver's Add and her Save end the same way: one saved copy that works offline. */
  const saveRavelryCopy = async (
    details: RavelryPatternDetails,
    stillAllowed: () => void
  ): Promise<{ file: KnittingFile; failed: number; pages: number }> => {
    const wanted = details.ravelryId
    const { pictures, failed } = await importRavelryPictures(
      details.pictureUrls,
      ravelry(),
      ravelryPictures(),
      codec(),
      temporaryFolder(),
      wanted
    )
    const pages = details.instructionsUrl
      ? await importRavelryInstructions(
          details.instructionsUrl,
          ravelry(),
          ravelryPdf,
          ravelryPictures(),
          codec(),
          temporaryFolder(),
          wanted,
          logRavelry
        )
      : []
    try {
      stillAllowed()
      const file = await knitting().update((current) => {
        alreadySaved(current, wanted)
        const pattern: RavelryPattern = {
          id: randomUUID(),
          ravelryId: wanted,
          name: details.name,
          designer: details.designer,
          facts: details.facts,
          notes: details.notes,
          pictures,
          ...(details.permalink && { permalink: details.permalink }),
          pages,
          lastPage: 0
        }
        return { ...current, ravelry: [...current.ravelry, pattern] }
      })
      return { file, failed, pages: pages.length }
    } catch (error) {
      // Pictures with no pattern record would be unreachable files; take them back out.
      await removePictures(ravelryPictures(), [...pictures, ...pages])
      throw error
    }
  }

  /** Her Save, from either screen. Never throws: every outcome is something calm to show. */
  const saveForHer = async (
    load: () => Promise<RavelryPatternDetails>
  ): Promise<RavelrySaveResult> => {
    if (addingRavelry) return { ok: false, reason: 'unavailable' }
    addingRavelry = true
    try {
      const before = await knitting().read()
      const details = await load()
      const existing = before.ravelry.find((item) => item.ravelryId === details.ravelryId)
      if (existing) return { ok: true, withInstructions: existing.pages.length > 0 }
      if (before.ravelry.length >= MAX_RAVELRY_PATTERNS) return { ok: false, reason: 'full' }
      const { pages } = await saveRavelryCopy(details, () => undefined)
      logActivity('knitting-ravelry-saved-by-her')
      announce()
      return { ok: true, withInstructions: pages > 0 }
    } catch {
      return { ok: false, reason: 'unavailable' }
    } finally {
      addingRavelry = false
    }
  }

  ipcMain.handle(
    'knitting:saveRavelry',
    async (event, req: { ravelryId?: unknown }): Promise<IpcResponse<'knitting:saveRavelry'>> => {
      requireHome(event)
      const id = req?.ravelryId
      if (!Number.isSafeInteger(id) || !ravelryServed(id as number)) {
        return { ok: false, reason: 'unavailable' }
      }
      return saveForHer(() => ravelry().pattern(id as number))
    }
  )

  ipcMain.handle(
    'knitting:ravelryPageState',
    async (event): Promise<IpcResponse<'knitting:ravelryPageState'>> => {
      requireHome(event)
      const permalink = parseRavelryPatternPage(currentPage())
      if (!permalink) return { savable: false, saved: false }
      try {
        if (!ravelry().status().connected) return { savable: false, saved: false }
        const file = await knitting().read()
        return {
          savable: true,
          saved: file.ravelry.some((item) => item.permalink === permalink)
        }
      } catch {
        return { savable: false, saved: false }
      }
    }
  )

  ipcMain.handle(
    'knitting:saveRavelryPage',
    async (event): Promise<IpcResponse<'knitting:saveRavelryPage'>> => {
      requireHome(event)
      const permalink = parseRavelryPatternPage(currentPage())
      if (!permalink) return { ok: false, reason: 'unavailable' }
      return saveForHer(() => ravelry().patternByPermalink(permalink))
    }
  )
  ipcMain.handle(
    'knitting:addRavelry',
    async (event, req: { ravelryId?: unknown }): Promise<IpcResponse<'knitting:addRavelry'>> => {
      requireCaregiver(event)
      const ravelryId = req?.ravelryId
      if (!Number.isSafeInteger(ravelryId) || (ravelryId as number) <= 0) {
        throw new Error('Unknown pattern')
      }
      const wanted = ravelryId as number
      if (addingRavelry) throw new Error('A pattern is already being added.')
      addingRavelry = true
      try {
        alreadySaved(await knitting().read(), wanted)
        const details = await ravelry().pattern(wanted)
        // The lock or the window may have changed while Ravelry was answering.
        requireCaregiver(event)
        const { file, failed } = await saveRavelryCopy(details, () => requireCaregiver(event))
        logActivity('knitting-ravelry-added')
        announce()
        return { knitting: await forAdmin(file), failedPictures: failed }
      } finally {
        addingRavelry = false
      }
    }
  )

  ipcMain.handle(
    'knitting:removeRavelry',
    async (event, req: { id?: unknown }): Promise<IpcResponse<'knitting:removeRavelry'>> => {
      requireCaregiver(event)
      const id = req?.id
      if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Unknown pattern')
      let removed: RavelryPattern | undefined
      // The record goes first: an interrupted removal leaves unused files, never a broken card.
      const file = await knitting().update((current) => {
        removed = current.ravelry.find((pattern) => pattern.id === id)
        if (!removed) return current
        return { ...current, ravelry: current.ravelry.filter((pattern) => pattern.id !== id) }
      })
      if (removed) {
        await removePictures(ravelryPictures(), [...removed.pictures, ...removed.pages])
        logActivity('knitting-ravelry-removed')
        announce()
      }
      return forAdmin(file)
    }
  )
}
