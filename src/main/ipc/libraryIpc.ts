import { app, dialog, ipcMain } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipcContract'
import { isMediaLibrary, type MediaLibrary } from '@shared/media/mediaPath'
import { LibraryStore } from '../services/media/libraryStore'
import { requireAdminUnlocked } from './requireAdminUnlocked'

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
      return library(request).list()
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
      const selection = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections', 'dontAddToRecent']
      })
      requireAdminUnlocked()
      if (selection.canceled) return []
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
      return library(request).update(request.id, request.patch)
    }
  )
  ipcMain.handle(
    'library:remove',
    (_event, request: IpcRequest<'library:remove'>): Promise<IpcResponse<'library:remove'>> => {
      requireAdminUnlocked()
      return library(request).remove(request.id)
    }
  )
}
