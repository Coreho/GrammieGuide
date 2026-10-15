import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlock: vi.fn(),
  getPath: vi.fn(),
  dialog: vi.fn(),
  list: vi.fn(),
  addImage: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  decode: vi.fn(),
  logActivity: vi.fn(),
  getConfig: vi.fn(),
  windows: vi.fn(),
  windowSend: vi.fn()
}))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: mocks.windows },
  ipcMain: { handle: mocks.handle },
  app: { getPath: mocks.getPath },
  dialog: { showOpenDialog: mocks.dialog },
  nativeImage: { createFromPath: mocks.decode }
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.getConfig }))
vi.mock('../../src/main/services/music/musicSettings', () => ({ removeTrackReferences: vi.fn() }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({
  logActivity: mocks.logActivity
}))
vi.mock('../../src/main/services/media/libraryStore', () => ({
  LibraryStore: class {
    list = mocks.list
    addImage = mocks.addImage
    update = mocks.update
    remove = mocks.remove
  }
}))
import { registerLibraryIpc } from '../../src/main/ipc/libraryIpc'

const entry = {
  id: 'generated',
  fileName: 'generated.jpg',
  thumbFileName: 'generated.thumb.jpg',
  metadata: { caption: 'Family', showToHer: true, order: 1 }
}

describe('photo IPC boundaries', () => {
  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
  const invoke = async (channel: string, request?: unknown): Promise<unknown> =>
    mocks.handle.mock.calls.find(([name]) => name === channel)![1]({ sender }, request)

  beforeEach(() => {
    vi.resetAllMocks()
    sender.isDestroyed.mockReturnValue(false)
    mocks.getPath.mockReturnValue('private/userData')
    mocks.getConfig.mockReturnValue({ tiles: [] })
    mocks.windows.mockReturnValue([
      { webContents: { send: mocks.windowSend, isDestroyed: () => false } }
    ])
    sender.send.mockClear()
    mocks.list.mockResolvedValue([])
    mocks.addImage.mockResolvedValue(entry)
    mocks.decode.mockReturnValue({
      isEmpty: () => false,
      getSize: () => ({ width: 100, height: 100 }),
      toJPEG: () => Buffer.from('jpeg')
    })
    registerLibraryIpc()
  })

  it('returns thumbnails only for caregiver-selected tile photos, including an explicit hidden selection', async () => {
    mocks.getConfig.mockReturnValue({
      tiles: [
        { id: 'home', photoId: 'generated' },
        { id: 'missing', photoId: 'gone' },
        { id: 'icon' }
      ]
    })
    mocks.list.mockResolvedValue([
      { ...entry, metadata: { caption: 'Private', showToHer: false } },
      { ...entry, id: 'unselected', fileName: 'other.jpg', metadata: { caption: 'Secret' } }
    ])
    await expect(invoke('photos:tileImages')).resolves.toEqual({
      home: 'grammie-media://photos/generated.thumb.jpg'
    })
    expect(mocks.unlock).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('does not read the library when no tiles use photos', async () => {
    await expect(invoke('photos:tileImages')).resolves.toEqual({})
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('notifies Home after a successful deletion, without photo content', async () => {
    mocks.remove.mockResolvedValue(true)
    await invoke('photos:remove', { id: 'generated' })
    expect(mocks.windowSend).toHaveBeenCalledExactlyOnceWith('photos:changed', {})
    mocks.windowSend.mockClear()
    mocks.remove.mockRejectedValue(new Error('disk'))
    await expect(invoke('photos:remove', { id: 'generated' })).rejects.toThrow('Could not remove')
    expect(mocks.windowSend).not.toHaveBeenCalled()
  })

  it.each(['listAll', 'import', 'update', 'remove'])(
    'checks the admin lock before processing %s',
    async (op) => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      await expect(invoke(`photos:${op}`, null)).rejects.toThrow('locked')
      expect(mocks.unlock).toHaveBeenCalledOnce()
      for (const work of [
        mocks.getPath,
        mocks.dialog,
        mocks.list,
        mocks.decode,
        mocks.addImage,
        mocks.update,
        mocks.remove
      ])
        expect(work).not.toHaveBeenCalled()
    }
  )

  it('lets the locked launcher list only visible photos, in caregiver order, using media URLs', async () => {
    mocks.unlock.mockImplementation(() => {
      throw new Error('locked')
    })
    mocks.list.mockResolvedValue([
      entry,
      {
        ...entry,
        id: 'hidden',
        metadata: { caption: 'Private caption', showToHer: false, order: 0 }
      },
      { ...entry, id: 'first', metadata: { showToHer: true, order: 0 } },
      { ...entry, id: 'legacy', metadata: {} }
    ])
    const result = await invoke('photos:listVisible', { all: true })
    expect((result as { id: string }[]).map((photo) => photo.id)).toEqual(['first', 'generated'])
    expect(JSON.stringify(result)).not.toContain('Private caption')
    expect(JSON.stringify(result)).not.toContain('userData')
    expect(JSON.stringify(result)).toContain('grammie-media://photos/')
    expect(mocks.unlock).not.toHaveBeenCalled()
  })

  it('lists all for admin and delegates validated updates and removal', async () => {
    mocks.list.mockResolvedValue([entry])
    mocks.update.mockResolvedValue({
      ...entry,
      metadata: { caption: '', showToHer: false, order: 2 }
    })
    mocks.remove.mockResolvedValue(true)
    expect(await invoke('photos:listAll')).toHaveLength(1)
    expect(
      await invoke('photos:update', {
        id: entry.id,
        patch: { caption: '', showToHer: false, order: 2 }
      })
    ).toMatchObject({ caption: '', showToHer: false, order: 2 })
    expect(mocks.update).toHaveBeenCalledWith(entry.id, { caption: '', showToHer: false, order: 2 })
    expect(await invoke('photos:remove', { id: entry.id })).toBe(true)
    expect(mocks.remove).toHaveBeenCalledWith(entry.id)
    expect(mocks.unlock).toHaveBeenCalledTimes(6)
  })

  it('opens only visible photos and records no photo content or captions', async () => {
    mocks.list.mockResolvedValue([
      entry,
      { ...entry, id: 'hidden', metadata: { caption: 'Private caption', showToHer: false } }
    ])
    const result = await invoke('photos:open')
    expect(result).toEqual([expect.objectContaining({ id: entry.id, caption: 'Family' })])
    expect(mocks.unlock).not.toHaveBeenCalled()
    expect(mocks.logActivity).toHaveBeenCalledExactlyOnceWith('photos-viewer-opened')
    expect(JSON.stringify(mocks.logActivity.mock.calls)).not.toContain('Family')
    expect(JSON.stringify(result)).not.toContain('Private caption')
  })

  it('uses only native-picker paths and pushes path-free progress to the requesting renderer', async () => {
    mocks.dialog.mockResolvedValue({
      canceled: false,
      filePaths: ['private/a.jpg', 'private/b.heic', 'private/c.webp']
    })
    mocks.decode.mockImplementation((path: string) => ({
      isEmpty: () => path.endsWith('.heic'),
      getSize: () => ({ width: 100, height: 100 }),
      toJPEG: () => Buffer.from('jpeg')
    }))
    expect(await invoke('photos:import', { paths: ['untrusted.jpg'] })).toEqual({
      imported: 2,
      failed: 1
    })
    expect(mocks.dialog).toHaveBeenCalledWith({
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'] }]
    })
    expect(mocks.decode.mock.calls.map(([path]) => path)).toEqual([
      'private/a.jpg',
      'private/b.heic',
      'private/c.webp'
    ])
    expect(sender.send).toHaveBeenCalledTimes(4)
    expect(sender.send).toHaveBeenLastCalledWith('photos:importProgress', {
      total: 3,
      completed: 3,
      imported: 2,
      failed: 1
    })
    expect(JSON.stringify(sender.send.mock.calls)).not.toContain('private')
    expect(mocks.unlock).toHaveBeenCalledTimes(4)
  })

  it('handles cancellation and rechecks the lock after the picker closes', async () => {
    mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await invoke('photos:import')).toEqual({ imported: 0, failed: 0 })
    expect(mocks.list).not.toHaveBeenCalled()
    mocks.dialog.mockImplementation(async () => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      return { canceled: false, filePaths: ['private/a.jpg'] }
    })
    await expect(invoke('photos:import')).rejects.toThrow('locked')
    expect(mocks.decode).not.toHaveBeenCalled()
  })

  it('finishes importing if the requesting admin window closes between progress events', async () => {
    mocks.dialog.mockResolvedValue({
      canceled: false,
      filePaths: ['private/a.jpg', 'private/b.png']
    })
    sender.send.mockImplementationOnce(() => sender.isDestroyed.mockReturnValue(true))
    expect(await invoke('photos:import')).toEqual({ imported: 2, failed: 0 })
    expect(mocks.addImage).toHaveBeenCalledTimes(2)
    expect(sender.send).toHaveBeenCalledOnce()
  })

  it('rejects overlapping imports while the picker is open, and resets after cancellation', async () => {
    let release!: (value: unknown) => void
    mocks.dialog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const first = invoke('photos:import')
    await expect(invoke('photos:import')).rejects.toThrow('already running')
    release({ canceled: true, filePaths: [] })
    await first
    mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await invoke('photos:import')).toEqual({ imported: 0, failed: 0 })
  })

  it('lets Home read photos and admin change them while the photo picker is open', async () => {
    let release!: (value: unknown) => void
    mocks.dialog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    mocks.list.mockResolvedValue([entry])
    mocks.remove.mockResolvedValue(true)
    const importing = invoke('photos:import')
    await vi.waitFor(() => expect(mocks.dialog).toHaveBeenCalledOnce())
    expect(await invoke('photos:listVisible')).toHaveLength(1)
    expect(await invoke('photos:remove', { id: 'generated' })).toBe(true)
    release({ canceled: true, filePaths: [] })
    expect(await importing).toEqual({ imported: 0, failed: 0 })
  })

  it.each(['listAll', 'listVisible', 'update', 'remove', 'import'])(
    'keeps filesystem errors path-free for %s',
    async (op) => {
      const error = new Error('EPERM private/path with no errno code')
      for (const work of [mocks.list, mocks.update, mocks.remove, mocks.dialog])
        work.mockRejectedValue(error)
      // Reach the update itself, instead of failing during its preceding lookup.
      if (op === 'update') mocks.list.mockResolvedValue([entry])
      await expect(invoke(`photos:${op}`, { id: 'id', patch: {} })).rejects.toThrow(/^Could not /)
    }
  )

  it.each([{ sourcePath: 'private' }, { order: -1 }, { showToHer: 'yes' }, { caption: [] }])(
    'rejects invalid updates before accessing the store: %j',
    async (patch) => {
      await expect(invoke('photos:update', { id: 'id', patch })).rejects.toThrow(
        'Invalid photo changes'
      )
      expect(mocks.getPath).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
    }
  )

  it.each(['import', 'update', 'remove'])(
    'prevents the generic %s channel from bypassing photo processing',
    async (op) => {
      await expect(
        invoke(`library:${op}`, { library: 'photos', id: 'id', patch: { sourcePath: 'private' } })
      ).rejects.toThrow('Use the Photos tab')
      expect(mocks.getPath).not.toHaveBeenCalled()
      expect(mocks.dialog).not.toHaveBeenCalled()
    }
  )
})
