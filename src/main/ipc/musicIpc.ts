import { dialog, ipcMain, nativeImage } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipcContract'
import type { MediaLibrary } from '@shared/media/mediaPath'
import { musicSettingsSchema } from '@shared/music/musicSchema'
import { MUSIC_EXTENSIONS } from '@shared/music/musicTypes'
import { getConfig } from '../config/store'
import type { LibraryStore } from '../services/media/libraryStore'
import { MusicLibrary } from '../services/music/musicLibrary'
import { createTrackMetadataReader } from '../services/music/readTrackMetadata'
import { removeTrackReferences, saveMusicSettings } from '../services/music/musicSettings'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { runMusicOperation } from '../services/music/musicOperations'

export function registerMusicIpc(getStore: (kind: MediaLibrary) => LibraryStore): void {
  let library: MusicLibrary | undefined
  const music = (): MusicLibrary =>
    (library ??= new MusicLibrary(
      getStore('music'),
      createTrackMetadataReader((bytes) => nativeImage.createFromBuffer(bytes))
    ))
  function run<T>(work: () => Promise<T>, message: string): Promise<T> {
    return runMusicOperation(async () => {
      // A queued request might have waited behind a native picker while admin locked.
      requireAdminUnlocked()
      try {
        return await work()
      } catch {
        throw new Error(message)
      }
    })
  }
  ipcMain.handle('music:list', (): Promise<IpcResponse<'music:list'>> => {
    requireAdminUnlocked()
    return run(
      async () => ({ tracks: await music().list(), settings: getConfig().music }),
      'Could not read the music library.'
    )
  })
  let importing = false
  ipcMain.handle('music:importFiles', async (event): Promise<IpcResponse<'music:importFiles'>> => {
    requireAdminUnlocked()
    if (importing) throw new Error('A music import is already running.')
    importing = true
    try {
      return await run(async () => {
        const selected = await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
          filters: [{ name: 'Music', extensions: [...MUSIC_EXTENSIONS] }]
        })
        requireAdminUnlocked()
        if (selected.canceled) return { imported: 0, failed: 0 }
        return music().import(selected.filePaths, (count) => {
          if (!event.sender.isDestroyed()) event.sender.send('music:importProgress', count)
        })
      }, 'Could not import music. Please try again.')
    } finally {
      importing = false
    }
  })
  ipcMain.handle(
    'music:saveSettings',
    (
      _event,
      request: IpcRequest<'music:saveSettings'>
    ): Promise<IpcResponse<'music:saveSettings'>> => {
      requireAdminUnlocked()
      const parsed = musicSettingsSchema.safeParse(request)
      if (!parsed.success) throw new Error('Check the playlist names, songs and music settings.')
      return run(async () => {
        const ids = new Set((await music().list()).map((track) => track.id))
        if (parsed.data.playlists.some((list) => list.trackIds.some((id) => !ids.has(id))))
          throw new Error('Unavailable song')
        return saveMusicSettings(parsed.data)
      }, 'Could not save playlists. Choose songs that are still in the library.')
    }
  )
  ipcMain.handle(
    'music:removeTrack',
    (_event, request: IpcRequest<'music:removeTrack'>): Promise<boolean> => {
      requireAdminUnlocked()
      if (!request || typeof request.id !== 'string') throw new Error('Choose a song to remove.')
      return run(async () => {
        removeTrackReferences(request.id)
        return music().remove(request.id)
      }, 'Could not remove the song. Please try again.')
    }
  )
}
