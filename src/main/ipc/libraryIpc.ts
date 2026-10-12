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

export function registerLibraryIpc(): void {
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
    return library(request)
  }

  let photoLibrary: PhotoLibrary | undefined
  const photos = (): PhotoLibrary =>
    (photoLibrary ??= new PhotoLibrary(
      library({ library: 'photos' }),
      createNativePhotoCodec(nativeImage)
    ))

  async function photoWork<T>(work: () => Promise<T>, message: string): Promise<T> {
    try {
      return await work()
    } catch {
      // Native codec errors do not reliably have errno codes. Replace every service error.
      throw new Error(message)
    }
  }

  ipcMain.handle('photos:listVisible', (): Promise<IpcResponse<'photos:listVisible'>> =>
    photoWork(() => photos().listVisible(), 'Could not read the photos')
  )
  ipcMain.handle('photos:listAll', (): Promise<IpcResponse<'photos:listAll'>> => {
    requireAdminUnlocked()
    return photoWork(() => photos().listAll(), 'Could not read the photos')
  })
  let importingPhotos = false
  ipcMain.handle('photos:import', async (event): Promise<IpcResponse<'photos:import'>> => {
    requireAdminUnlocked()
    if (importingPhotos) throw new Error('A photo import is already running')
    importingPhotos = true
    try {
      const selection = await photoWork(
        () =>
          dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
            filters: [{ name: 'Photos', extensions: [...PHOTO_EXTENSIONS] }]
          }),
        'Could not open the photo picker'
      )
      requireAdminUnlocked()
      if (selection.canceled) return { imported: 0, failed: 0 }
      return await photoWork(
        () =>
          photos().import(selection.filePaths, (count) => {
            if (!event.sender.isDestroyed()) event.sender.send('photos:importProgress', count)
          }),
        'Could not import photos'
      )
    } finally {
      importingPhotos = false
    }
  })
  ipcMain.handle(
    'photos:update',
    (_event, request: IpcRequest<'photos:update'>): Promise<IpcResponse<'photos:update'>> => {
      requireAdminUnlocked()
      if (!request || typeof request.id !== 'string') throw new Error('Invalid photo')
      const patch = validatePhotoPatch(request.patch)
      return photoWork(() => photos().update(request.id, patch), 'Could not save the photo')
    }
  )
  ipcMain.handle(
    'photos:remove',
    (_event, request: IpcRequest<'photos:remove'>): Promise<IpcResponse<'photos:remove'>> => {
      requireAdminUnlocked()
      if (!request || typeof request.id !== 'string') throw new Error('Invalid photo')
      return photoWork(() => photos().remove(request.id), 'Could not remove the photo')
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
      return withoutPaths(
        mutableLibrary(request).remove(request.id),
        'Could not remove the media file'
      )
    }
  )
}
