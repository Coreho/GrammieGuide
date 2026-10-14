import { dialog, ipcMain, type WebContents } from 'electron'
import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { z } from 'zod'
import type { IpcRequest } from '@shared/ipcContract'
import type { MediaLibrary } from '@shared/media/mediaPath'
import { LIBRARY_EXTENSIONS, isLibraryMediaExtension } from '@shared/media/mediaTypes'
import { MAX_NARRATION_BYTES } from '@shared/media/narration'
import type { LibraryStore } from '../services/media/libraryStore'
import { PhotoNarration } from '../services/photos/photoNarration'
import { validateNarration } from '../services/photos/validateNarration'
import { runPhotoOperation } from '../services/photos/photoOperations'
import { photosChanged } from '../services/photos/photoEvents'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getAdminWindow } from '../windows/windowManager'

const photoId = z.string().uuid()
function requireNarrationAdmin(sender: WebContents): void {
  requireAdminUnlocked()
  if (sender !== getAdminWindow()?.webContents) throw new Error('Story controls unavailable')
}
export function registerNarrationIpc(getStore: (kind: MediaLibrary) => LibraryStore): void {
  const narration = (): PhotoNarration =>
    new PhotoNarration(getStore('photos'), getStore('narration'), validateNarration)
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    requireAdminUnlocked()
    return runPhotoOperation(async () => {
      requireAdminUnlocked()
      try {
        return await work()
      } catch {
        throw new Error('Could not save the story. Please try again.')
      }
    })
  }
  const result = async (id: string): Promise<{ url: string; autoPlay: boolean } | null> => {
    const placeholder = {
      id,
      url: '',
      thumbnailUrl: '',
      caption: '',
      showToHer: false,
      order: 0,
      importIndex: 0
    }
    return (await narration().decorate([placeholder]))[0]!.narration ?? null
  }
  ipcMain.handle(
    'photos:recordNarration',
    (event, request: IpcRequest<'photos:recordNarration'>) => {
      requireNarrationAdmin(event.sender)
      if (
        event.sender !== getAdminWindow()?.webContents ||
        !request ||
        !photoId.safeParse(request.id).success ||
        !(request.bytes instanceof Uint8Array) ||
        request.bytes.byteLength > MAX_NARRATION_BYTES
      )
        throw new Error('Invalid recording')
      const bytes = Buffer.from(request.bytes)
      return run(async () => {
        await narration().save(request.id, bytes, '.webm')
        photosChanged()
        return result(request.id)
      })
    }
  )
  ipcMain.handle(
    'photos:attachNarration',
    (_event, request: IpcRequest<'photos:attachNarration'>) => {
      requireNarrationAdmin(_event.sender)
      if (!request || !photoId.safeParse(request.id).success) throw new Error('Invalid photo')
      return run(async () => {
        const selected = await dialog.showOpenDialog({
          properties: ['openFile', 'dontAddToRecent'],
          filters: [{ name: 'Story audio', extensions: [...LIBRARY_EXTENSIONS.narration] }]
        })
        requireAdminUnlocked()
        if (selected.canceled) return result(request.id)
        const path = selected.filePaths[0]
        if (!path || !isLibraryMediaExtension('narration', extname(path)))
          throw new Error('Unsupported audio')
        const file = await open(path, 'r')
        let bytes: Buffer
        try {
          const info = await file.stat()
          if (!info.isFile() || !info.size || info.size > MAX_NARRATION_BYTES)
            throw new Error('Audio too large')
          bytes = Buffer.alloc(info.size)
          const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
          if (bytesRead !== bytes.length) throw new Error('Audio unavailable')
        } finally {
          await file.close()
        }
        requireAdminUnlocked()
        await narration().save(request.id, bytes, extname(path).toLowerCase())
        photosChanged()
        return result(request.id)
      })
    }
  )
  ipcMain.handle(
    'photos:removeNarration',
    (_event, request: IpcRequest<'photos:removeNarration'>) => {
      requireNarrationAdmin(_event.sender)
      if (!request || !photoId.safeParse(request.id).success) throw new Error('Invalid photo')
      return run(async () => {
        await narration().remove(request.id)
        photosChanged()
        return null
      })
    }
  )
  ipcMain.handle(
    'photos:setNarrationAutoPlay',
    (_event, request: IpcRequest<'photos:setNarrationAutoPlay'>) => {
      requireNarrationAdmin(_event.sender)
      if (
        !request ||
        !photoId.safeParse(request.id).success ||
        typeof request.enabled !== 'boolean'
      )
        throw new Error('Invalid story setting')
      return run(async () => {
        await narration().setAutoPlay(request.id, request.enabled)
        photosChanged()
        return result(request.id)
      })
    }
  )
}
