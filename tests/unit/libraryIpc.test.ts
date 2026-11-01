import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlock: vi.fn(),
  getPath: vi.fn(),
  dialog: vi.fn(),
  list: vi.fn(),
  import: vi.fn(),
  update: vi.fn(),
  remove: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  app: { getPath: mocks.getPath },
  dialog: { showOpenDialog: mocks.dialog }
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/services/music/musicSettings', () => ({ removeTrackReferences: vi.fn() }))
vi.mock('../../src/main/services/media/libraryStore', () => ({
  LibraryStore: class {
    list = mocks.list
    import = mocks.import
    update = mocks.update
    remove = mocks.remove
  }
}))
import { registerLibraryIpc } from '../../src/main/ipc/libraryIpc'

const photoExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico']
const musicExtensions = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'webm']
const libraries = [
  { library: 'music', name: 'Music', extensions: musicExtensions, other: photoExtensions }
] as const

describe('admin library IPC', () => {
  const invoke = async (channel: string, request: unknown): Promise<unknown> =>
    mocks.handle.mock.calls.find(([name]) => name === channel)![1]({}, request)

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPath.mockReturnValue('userData')
    registerLibraryIpc()
  })

  it.each(['list', 'import', 'update', 'remove'])(
    'checks the lock before any %s request processing',
    async (op) => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      await expect(invoke(`library:${op}`, null)).rejects.toThrow('locked')
      expect(mocks.unlock).toHaveBeenCalledOnce()
      expect(mocks.getPath).not.toHaveBeenCalled()
      for (const operation of [
        mocks.dialog,
        mocks.list,
        mocks.import,
        mocks.update,
        mocks.remove
      ]) {
        expect(operation).not.toHaveBeenCalled()
      }
    }
  )

  it('lists, updates and removes through the store', async () => {
    mocks.list.mockResolvedValue([])
    mocks.update.mockResolvedValue({ id: 'id' })
    mocks.remove.mockResolvedValue(true)
    expect(await invoke('library:list', { library: 'photos' })).toEqual([])
    expect(
      await invoke('library:update', { library: 'music', id: 'id', patch: { title: 'Family' } })
    ).toEqual({ id: 'id' })
    expect(mocks.update).toHaveBeenCalledWith('id', { title: 'Family' })
    expect(await invoke('library:remove', { library: 'music', id: 'id' })).toBe(true)
    expect(mocks.remove).toHaveBeenCalledWith('id')
    expect(mocks.unlock).toHaveBeenCalledTimes(4)
  })

  it('keeps filesystem paths out of list, update and remove errors', async () => {
    const fsError = (): Error =>
      Object.assign(
        new Error("EPERM: operation not permitted, rename 'C:\\Users\\her\\index.json'"),
        {
          code: 'EPERM'
        }
      )
    mocks.list.mockRejectedValue(fsError())
    mocks.update.mockRejectedValue(fsError())
    mocks.remove.mockRejectedValue(fsError())
    for (const [channel, request] of [
      ['library:list', { library: 'photos' }],
      ['library:update', { library: 'music', id: 'id', patch: {} }],
      ['library:remove', { library: 'music', id: 'id' }]
    ] as const) {
      const error = await invoke(channel, request).catch((e: Error) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/^Could not /)
      expect((error as Error).message).not.toContain('Users')
    }
    // The store's own messages carry no paths and stay useful to the caregiver.
    mocks.update.mockRejectedValue(new Error('Library entry not found'))
    await expect(
      invoke('library:update', { library: 'music', id: 'gone', patch: {} })
    ).rejects.toThrow('Library entry not found')
  })

  it('imports only native-picker selections and returns entries without source paths', async () => {
    mocks.dialog.mockResolvedValue({ canceled: false, filePaths: ['private/song.mp3'] })
    mocks.import.mockResolvedValue([{ id: 'generated', fileName: 'generated.mp3', metadata: {} }])
    const result = await invoke('library:import', { library: 'music', paths: ['untrusted'] })
    expect(mocks.import).toHaveBeenCalledWith(['private/song.mp3'])
    expect(JSON.stringify(result)).not.toContain('private')
    expect(mocks.unlock).toHaveBeenCalledTimes(2)
  })

  for (const { library, name, extensions, other } of libraries) {
    it(`offers only supported ${library} types in the native picker`, async () => {
      mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] })
      await invoke('library:import', { library })
      expect(mocks.dialog).toHaveBeenCalledWith({
        properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
        filters: [{ name, extensions }]
      })
    })

    it(`imports every supported ${library} extension, regardless of case`, async () => {
      const paths = extensions.flatMap((ext) => [
        `C:\\private\\family file.${ext}`,
        `C:\\private\\family file.${ext.toUpperCase()}`
      ])
      const entries = paths.map((_, index) => ({ id: String(index) }))
      mocks.dialog.mockResolvedValue({ canceled: false, filePaths: paths })
      mocks.import.mockResolvedValue(entries)
      expect(await invoke('library:import', { library })).toEqual(entries)
      expect(mocks.import).toHaveBeenCalledExactlyOnceWith(paths)
    })

    it.each([
      ...other.map((ext) => `.${ext}`),
      '.exe',
      '.svg',
      '.heic',
      '.tiff',
      '.mp4',
      '',
      '.',
      '.jpg.exe',
      '.png ',
      '.toString'
    ])(`rejects a whole ${library} batch containing %s before importing`, async (ext) => {
      const paths = [`C:\\private\\valid.${extensions[0]}`, `C:\\private\\rejected${ext}`]
      mocks.dialog.mockResolvedValue({ canceled: false, filePaths: paths })
      const error = await invoke('library:import', { library }).catch((error: Error) => error)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(
        `No files were added. Choose ${library === 'photos' ? 'photo' : 'music'} files (${extensions.map((ext) => ext.toUpperCase()).join(', ')}).`
      )
      expect((error as Error).message).not.toContain('private')
      expect(mocks.import).not.toHaveBeenCalled()
    })
  }

  it('does not import after cancellation or if admin locks while the picker is open', async () => {
    mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await invoke('library:import', { library: 'music' })).toEqual([])
    expect(mocks.import).not.toHaveBeenCalled()
    mocks.dialog.mockImplementation(async () => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      return { canceled: false, filePaths: ['private/song.mp3'] }
    })
    await expect(invoke('library:import', { library: 'music' })).rejects.toThrow('locked')
    expect(mocks.import).not.toHaveBeenCalled()
  })

  it.each(['list', 'import', 'update', 'remove'])(
    'rejects unknown libraries for %s',
    async (op) => {
      await expect(invoke(`library:${op}`, { library: '../outside' })).rejects.toThrow()
      expect(mocks.dialog).not.toHaveBeenCalled()
      expect(mocks.getPath).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['import', 'patterns', 'Use the Knitting tab to change patterns'],
    ['update', 'patterns', 'Use the Knitting tab to change patterns'],
    ['remove', 'patterns', 'Use the Knitting tab to change patterns'],
    ['import', 'knitted', 'Use the Knitting tab to change her finished pieces'],
    ['update', 'knitted', 'Use the Knitting tab to change her finished pieces'],
    ['remove', 'knitted', 'Use the Knitting tab to change her finished pieces'],
    ['import', 'ravelry', 'Use the Knitting tab to change her Ravelry patterns'],
    ['update', 'ravelry', 'Use the Knitting tab to change her Ravelry patterns'],
    ['remove', 'ravelry', 'Use the Knitting tab to change her Ravelry patterns']
  ])(
    'keeps generic %s out of the %s library, which changes only through the Knitting tab',
    async (op, library, message) => {
      await expect(invoke(`library:${op}`, { library, id: 'x', metadata: {} })).rejects.toThrow(
        message
      )
      expect(mocks.dialog).not.toHaveBeenCalled()
      expect(mocks.import).not.toHaveBeenCalled()
    }
  )

  it('does not expose source paths through import errors', async () => {
    mocks.dialog.mockResolvedValue({ canceled: false, filePaths: ['private/song.mp3'] })
    mocks.import.mockRejectedValue(new Error('ENOENT: private/song.mp3'))
    await expect(invoke('library:import', { library: 'music' })).rejects.toThrow(
      'Could not import media files'
    )
  })
})
