import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  references: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  app: { getPath: () => 'private' },
  nativeImage: {},
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.get }))
vi.mock('../../src/main/windows/windowManager', () => ({ getLauncherWindow: () => null }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: () => {} }))
vi.mock('../../src/main/services/music/musicSettings', () => ({
  saveMusicSettings: mocks.save,
  removeTrackReferences: mocks.references
}))
vi.mock('../../src/main/services/music/readTrackMetadata', () => ({
  createTrackMetadataReader: () => {}
}))
vi.mock('../../src/main/services/music/musicLibrary', () => ({
  MusicLibrary: class {
    list = mocks.list
    remove = mocks.remove
  }
}))
vi.mock('../../src/main/services/media/libraryStore', () => ({
  LibraryStore: class {
    remove = mocks.remove
  }
}))
import { registerLibraryIpc } from '../../src/main/ipc/libraryIpc'
import { registerMusicIpc } from '../../src/main/ipc/musicIpc'

describe('legacy deletion racing a playlist save', () => {
  beforeEach(() => vi.resetAllMocks())
  it('cannot save a reference after legacy removal deletes the file', async () => {
    const id = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'
    const cfg = defaultConfig()
    let exists = true
    let release!: (songs: { id: string }[]) => void
    mocks.get.mockImplementation(() => cfg)
    mocks.list.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    mocks.save.mockImplementation((music) => {
      cfg.music = music
      return music
    })
    mocks.references.mockImplementation((removed) => {
      cfg.music = {
        ...cfg.music,
        playlists: cfg.music.playlists.map((list) => ({
          ...list,
          trackIds: list.trackIds.filter((track) => track !== removed)
        }))
      }
    })
    mocks.remove.mockImplementation(async () => {
      exists = false
      return true
    })
    registerMusicIpc(registerLibraryIpc())
    const invoke = (channel: string, request: unknown): Promise<unknown> =>
      mocks.handle.mock.calls.find(([name]) => name === channel)![1]({}, request)
    const saving = invoke('music:saveSettings', {
      ...cfg.music,
      playlists: [{ id, label: 'Favorites', shuffle: false, trackIds: [id] }]
    })
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledOnce())
    const removing = invoke('library:remove', { library: 'music', id })
    release([{ id }])
    await Promise.all([saving, removing])
    expect(exists).toBe(false)
    expect(cfg.music.playlists[0]!.trackIds).toEqual([])
  })
})
