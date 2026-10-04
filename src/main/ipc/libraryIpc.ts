import { app, dialog, ipcMain } from 'electron'
import { extname } from 'node:path'
import type { IpcRequest, IpcResponse } from '@shared/ipcContract'
import { isMediaLibrary, type MediaLibrary } from '@shared/media/mediaPath'
import { LIBRARY_EXTENSIONS, isLibraryMediaExtension } from '@shared/media/mediaTypes'
import { LibraryStore } from '../services/media/libraryStore'
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
      const store = library(request)
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
        library(request).update(request.id, request.patch),
        'Could not update the media library'
      )
    }
  )
  ipcMain.handle(
    'library:remove',
    (_event, request: IpcRequest<'library:remove'>): Promise<IpcResponse<'library:remove'>> => {
      requireAdminUnlocked()
      return withoutPaths(library(request).remove(request.id), 'Could not remove the media file')
    }
  )
}
