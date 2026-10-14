import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlock: vi.fn(),
  picker: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  autoPlay: vi.fn(),
  changed: vi.fn(),
  open: vi.fn(),
  admin: { id: 7 }
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  dialog: { showOpenDialog: mocks.picker }
}))
vi.mock('node:fs/promises', () => ({ open: mocks.open }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => ({ webContents: mocks.admin })
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/services/photos/photoEvents', () => ({ photosChanged: mocks.changed }))
vi.mock('../../src/main/services/photos/photoNarration', () => ({
  PhotoNarration: class {
    save = mocks.save
    remove = mocks.remove
    setAutoPlay = mocks.autoPlay
    async decorate(photos: unknown[]): Promise<unknown[]> {
      return photos
    }
  }
}))
import { registerNarrationIpc } from '../../src/main/ipc/narrationIpc'
import type { LibraryStore } from '../../src/main/services/media/libraryStore'
const id = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'
const record = { id, bytes: new Uint8Array([1, 2]) }
const channels = [
  'photos:recordNarration',
  'photos:attachNarration',
  'photos:removeNarration',
  'photos:setNarrationAutoPlay'
]
const request = (channel: string): unknown =>
  channel === channels[0] ? record : { id, enabled: true }
const invoke = (
  channel: string,
  body: unknown = request(channel),
  sender: unknown = mocks.admin
): Promise<unknown> =>
  Promise.resolve().then(() =>
    mocks.handle.mock.calls.find(([name]) => name === channel)![1]({ sender }, body)
  )
describe('caregiver story IPC', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    registerNarrationIpc(() => ({}) as LibraryStore)
    mocks.picker.mockResolvedValue({ canceled: true, filePaths: [] })
  })
  it.each(channels)(
    'rejects locked and non-admin %s requests before touching media',
    async (channel) => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      await expect(invoke(channel)).rejects.toThrow('locked')
      mocks.unlock.mockImplementation(() => {})
      await expect(invoke(channel, request(channel), {})).rejects.toThrow(
        'Story controls unavailable'
      )
      expect(mocks.save).not.toHaveBeenCalled()
      expect(mocks.picker).not.toHaveBeenCalled()
      expect(mocks.remove).not.toHaveBeenCalled()
    }
  )
  it('validates recording payloads and uses a copied buffer with no renderer-supplied path', async () => {
    await expect(invoke(channels[0]!, { id: '../escape', bytes: record.bytes })).rejects.toThrow(
      'Invalid recording'
    )
    await expect(invoke(channels[0]!, { id, bytes: [1, 2] })).rejects.toThrow('Invalid recording')
    await invoke(channels[0]!)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(id, Buffer.from([1, 2]), '.webm')
    expect(mocks.changed).toHaveBeenCalledOnce()
  })
  it('rechecks the lock after the native picker, so a locked panel never copies its chosen path', async () => {
    mocks.picker.mockImplementation(async () => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      return { canceled: false, filePaths: ['private/source.wav'] }
    })
    await expect(invoke(channels[1]!)).rejects.toThrow('Could not save the story')
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rechecks the lock after waiting behind a replacement', async () => {
    let release!: () => void
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const first = invoke(channels[0]!)
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce())
    const second = invoke(channels[3]!)
    mocks.unlock.mockImplementation(() => {
      throw new Error('locked')
    })
    const rejected = expect(second).rejects.toThrow('locked')
    release()
    await first
    await rejected
    expect(mocks.autoPlay).not.toHaveBeenCalled()
  })
})
