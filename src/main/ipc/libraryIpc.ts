import { app, dialog, ipcMain, nativeImage } from 'electron'
import { extname } from 'node:path'
import type { IpcRequest, IpcResponse } from '@shared/ipcContract'
import { isMediaLibrary, type MediaLibrary } from '@shared/media/mediaPath'
import { LIBRARY_EXTENSIONS, isLibraryMediaExtension } from '@shared/media/mediaTypes'
import { LibraryStore } from '../services/media/libraryStore'
import { PhotoLibrary, validatePhotoPatch } from '../services/photos/photoLibrary'
import { createNativePhotoCodec } from '../services/photos/nativePhotoCodec'
import { PHOTO_EXTENSIONS } from '@shared/media/photoTypes'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { logActivity } from '../services/activityLog/activityLog'
import { getConfig } from '../config/store'
import { removeTrackReferences } from '../services/music/musicSettings'
import { runMusicOperation } from '../services/music/musicOperations'
import { runPhotoOperation } from '../services/photos/photoOperations'
import { photosChanged } from '../services/photos/photoEvents'
import { PhotoNarration } from '../services/photos/photoNarration'
import { validateNarration } from '../services/photos/validateNarration'

/**
 * The store's own errors are plain messages, but filesystem errors (EPERM, ENOSPC...) name
 * userData paths. Like import's, those are replaced before they cross IPC.
 */
async function withoutPaths<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work
  } catch (error) {
    if (typeof (error as NodeJS.ErrnoException | null)?.code === 'string') throw new Error(message)
    throw error
  }
}

export function registerLibraryIpc(): (kind: MediaLibrary) => LibraryStore {
  const stores = new Map<MediaLibrary, LibraryStore>()
  function library(request: { library: MediaLibrary }): LibraryStore {
    if (!request || !isMediaLibrary(request.library)) throw new Error('Invalid media library')
    let store = stores.get(request.library)
    if (!store) {
      store = new LibraryStore(app.getPath('userData'), request.library)
      stores.set(request.library, store)
    }
    return store
  }

  function mutableLibrary(request: { library: MediaLibrary }): LibraryStore {
    if (!request || !isMediaLibrary(request.library)) throw new Error('Invalid media library')
    // Photo writes must pass through decoding and typed metadata validation.
    if (request.library === 'photos')
      throw new Error('Use the Photos tab to change the photo library')
    if (request.library === 'narration') throw new Error('Use the Photos tab to change stories')
    return library(request)
  }

  let photoLibrary: PhotoLibrary | undefined
  const photos = (): PhotoLibrary =>
    (photoLibrary ??= new PhotoLibrary(
      library({ library: 'photos' }),
      createNativePhotoCodec(nativeImage)
    ))
  const narration = (): PhotoNarration =>
    new PhotoNarration(
      library({ library: 'photos' }),
      library({ library: 'narration' }),
      validateNarration
    )

  async function photoWork<T>(work: () => Promise<T>, message: string): Promise<T> {
    try {
      return await work()
    } catch {
      // Native codec errors do not reliably have errno codes. Replace every service error.
      throw new Error(message)
    }
  }
  /**
   * Changes share one queue with story edits so a removed photo can't keep its story. Reads
   * and pickers stay out of it: her viewer and tile pictures must not wait on an open picker
   * or a long import.
   */
  function photoChange<T>(work: () => Promise<T>, message: string): Promise<T> {
    return runPhotoOperation(() => photoWork(work, message))
  }

  ipcMain.handle('photos:open', (): Promise<IpcResponse<'photos:open'>> => {
    // Opening is the only viewer activity recorded. Never log a photo, caption or path.
    logActivity('photos-viewer-opened')
    return photoWork(
      async () => narration().decorate(await photos().listVisible()),
      'Could not read the photos'
    )
  })
  ipcMain.handle('photos:listVisible', (): Promise<IpcResponse<'photos:listVisible'>> =>
    photoWork(
      async () => narration().decorate(await photos().listVisible()),
      'Could not read the photos'
    )
  )
  ipcMain.handle('photos:tileImages', (): Promise<IpcResponse<'photos:tileImages'>> =>
    photoWork(async () => {
      const tiles = getConfig().tiles.filter((tile) => tile.photoId)
      if (!tiles.length) return {}
      const images = new Map(
        (await photos().listAll()).map((photo) => [photo.id, photo.thumbnailUrl])
      )
      return Object.fromEntries(
        tiles.flatMap((tile) => {
          const url = images.get(tile.photoId!)
          return url ? [[tile.id, url]] : []
        })
      )
    }, 'Could not read the tile photos')
  )
  ipcMain.handle('photos:listAll', (): Promise<IpcResponse<'photos:listAll'>> => {
    requireAdminUnlocked()
    return photoWork(async () => {
      requireAdminUnlocked()
      return narration().decorate(await photos().listAll())
    }, 'Could not read the photos')
  })
  let importingPhotos = false
  ipcMain.handle('photos:import', async (event): Promise<IpcResponse<'photos:import'>> => {
    requireAdminUnlocked()
    if (importingPhotos) throw new Error('A photo import is already running')
    importingPhotos = true
    try {
      const selection = await photoWork(() => {
        requireAdminUnlocked()
        return dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
          filters: [{ name: 'Photos', extensions: [...PHOTO_EXTENSIONS] }]
        })
      }, 'Could not open the photo picker')
      requireAdminUnlocked()
      if (selection.canceled) return { imported: 0, failed: 0 }
      const result = await photoChange(() => {
        requireAdminUnlocked()
        return photos().import(selection.filePaths, (count) => {
          if (!event.sender.isDestroyed()) event.sender.send('photos:importProgress', count)
        })
      }, 'Could not import photos')
      if (result.imported) photosChanged()
      return result
    } finally {
      importingPhotos = false
    }
  })
  ipcMain.handle(
    'photos:update',
    async (_event, request: IpcRequest<'photos:update'>): Promise<IpcResponse<'photos:update'>> => {
      requireAdminUnlocked()
      if (!request || typeof request.id !== 'string') throw new Error('Invalid photo')
      const patch = validatePhotoPatch(request.patch)
      const result = await photoChange(async () => {
        requireAdminUnlocked()
        const updated = await photos().update(request.id, patch)
        return (await narration().decorate([updated]))[0]!
      }, 'Could not save the photo')
      photosChanged()
      return result
    }
  )
  ipcMain.handle(
    'photos:remove',
    async (_event, request: IpcRequest<'photos:remove'>): Promise<IpcResponse<'photos:remove'>> => {
      requireAdminUnlocked()
      if (!request || typeof request.id !== 'string') throw new Error('Invalid photo')
      const result = await photoChange(async () => {
        requireAdminUnlocked()
        const removed = await photos().remove(request.id)
        if (removed) await narration().remove(request.id)
        return removed
      }, 'Could not remove the photo')
      if (result) photosChanged()
      return result
    }
  )

  ipcMain.handle(
    'library:list',
    (_event, request: IpcRequest<'library:list'>): Promise<IpcResponse<'library:list'>> => {
      requireAdminUnlocked()
      return withoutPaths(library(request).list(), 'Could not read the media library')
    }
  )
  ipcMain.handle(
    'library:import',
    async (
      _event,
      request: IpcRequest<'library:import'>
    ): Promise<IpcResponse<'library:import'>> => {
      requireAdminUnlocked()
      const store = mutableLibrary(request)
      const extensions = LIBRARY_EXTENSIONS[request.library]
      const selection = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
        filters: [
          { name: request.library === 'photos' ? 'Photos' : 'Music', extensions: [...extensions] }
        ]
      })
      requireAdminUnlocked()
      if (selection.canceled) return []
      // Picker filters are only a convenience. Validate the whole batch before the store
      // can copy anything, and keep this useful message outside the filesystem-error catch.
      if (
        selection.filePaths.some((path) => !isLibraryMediaExtension(request.library, extname(path)))
      ) {
        throw new Error(
          `No files were added. Choose ${request.library === 'photos' ? 'photo' : 'music'} files (${extensions.map((extension) => extension.toUpperCase()).join(', ')}).`
        )
      }
      try {
        return await store.import(selection.filePaths)
      } catch {
        // Filesystem errors include private source paths; they must not cross IPC.
        throw new Error('Could not import media files')
      }
    }
  )
  ipcMain.handle(
    'library:update',
    (_event, request: IpcRequest<'library:update'>): Promise<IpcResponse<'library:update'>> => {
      requireAdminUnlocked()
      return withoutPaths(
        mutableLibrary(request).update(request.id, request.patch),
        'Could not update the media library'
      )
    }
  )
  ipcMain.handle(
    'library:remove',
    (_event, request: IpcRequest<'library:remove'>): Promise<IpcResponse<'library:remove'>> => {
      requireAdminUnlocked()
      const store = mutableLibrary(request)
      return withoutPaths(
        runMusicOperation(async () => {
          requireAdminUnlocked()
          removeTrackReferences(request.id)
          return store.remove(request.id)
        }),
        'Could not remove the media file'
      )
    }
  )
  return (kind) => library({ library: kind })
}
