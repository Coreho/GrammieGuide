import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlock: vi.fn(),
  dialog: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  import: vi.fn(),
  remove: vi.fn(),
  references: vi.fn(),
  save: vi.fn(),
  store: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  dialog: { showOpenDialog: mocks.dialog },
  nativeImage: { createFromBuffer: vi.fn() }
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.get }))
vi.mock('../../src/main/services/music/musicLibrary', () => ({
  MusicLibrary: class {
    list = mocks.list
    import = mocks.import
    remove = mocks.remove
  }
}))
vi.mock('../../src/main/services/music/readTrackMetadata', () => ({
  createTrackMetadataReader: vi.fn()
}))
vi.mock('../../src/main/services/music/musicSettings', () => ({
  removeTrackReferences: mocks.references,
  saveMusicSettings: mocks.save
}))
import { registerMusicIpc } from '../../src/main/ipc/musicIpc'
const id = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'
describe('caregiver music IPC', () => {
  const sender = { isDestroyed: () => false, send: vi.fn() }
  const invoke = (channel: string, request?: unknown): Promise<unknown> =>
    Promise.resolve().then(() =>
      mocks.handle.mock.calls.find(([name]) => name === channel)![1]({ sender }, request)
    )
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.get.mockReturnValue(defaultConfig())
    mocks.list.mockResolvedValue([{ id, title: 'Song' }])
    mocks.save.mockImplementation((settings) => settings)
    mocks.dialog.mockResolvedValue({ canceled: false, filePaths: ['private/song.mp3'] })
    mocks.import.mockResolvedValue({ imported: 1, failed: 0 })
    registerMusicIpc(mocks.store)
  })
  it.each(['list', 'importFiles', 'saveSettings', 'removeTrack'])(
    'locks %s before any work',
    async (op) => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      await expect(invoke(`music:${op}`)).rejects.toThrow('locked')
      expect(mocks.store).not.toHaveBeenCalled()
      expect(mocks.dialog).not.toHaveBeenCalled()
      expect(mocks.list).not.toHaveBeenCalled()
      expect(mocks.references).not.toHaveBeenCalled()
    }
  )
  it('uses only native picker paths and rechecks the lock after the picker', async () => {
    expect(await invoke('music:importFiles', { filePaths: ['forged.mp3'] })).toEqual({
      imported: 1,
      failed: 0
    })
    expect(mocks.import).toHaveBeenCalledWith(['private/song.mp3'], expect.any(Function))
    mocks.import.mockClear()
    mocks.dialog.mockImplementation(async () => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      return { canceled: false, filePaths: ['private/song.mp3'] }
    })
    await expect(invoke('music:importFiles')).rejects.toThrow('Could not import')
    expect(mocks.import).not.toHaveBeenCalled()
  })
  it('rejects a missing track without changing playlists', async () => {
    mocks.list.mockResolvedValue([])
    await expect(
      invoke('music:saveSettings', {
        ...defaultConfig().music,
        playlists: [{ id, label: 'Favorites', shuffle: true, trackIds: [id] }]
      })
    ).rejects.toThrow('Choose songs')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('saves validated playlists and prevents more than six', async () => {
    const settings = {
      ...defaultConfig().music,
      playlists: [{ id, label: ' Favorites ', shuffle: true, trackIds: [id] }]
    }
    const saved = await invoke('music:saveSettings', settings)
    expect(saved).toMatchObject({ playlists: [{ ...settings.playlists[0], label: 'Favorites' }] })
    await expect(
      invoke('music:saveSettings', { ...settings, playlists: Array(7).fill(settings.playlists[0]) })
    ).rejects.toThrow('Check the playlist')
  })
  it('does not delete an audio file if saving playlist reference removal fails', async () => {
    mocks.references.mockImplementation(() => {
      throw new Error('disk full')
    })
    await expect(invoke('music:removeTrack', { id })).rejects.toThrow('Could not remove')
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
