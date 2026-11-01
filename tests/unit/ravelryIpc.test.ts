import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RavelryService } from '../../src/main/services/ravelry/ravelryService'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  activity: vi.fn(),
  admin: { webContents: { mainFrame: {} } },
  home: { webContents: { mainFrame: {}, send: vi.fn() } }
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.activity }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
import { registerRavelryIpc } from '../../src/main/ipc/ravelryIpc'

const admin = { sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame }
const home = { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame }
const CHECKED = { username: 'read-abc', key: 'sekret-value' }

const service = {
  status: vi.fn(() => ({ connected: true, canSave: true })),
  checkKey: vi.fn(async () => CHECKED),
  saveKey: vi.fn(),
  removeKey: vi.fn(),
  search: vi.fn(async () => [{ ravelryId: 1, name: 'Hat', designer: '' }]),
  pattern: vi.fn(),
  picture: vi.fn()
} as unknown as RavelryService

const homeBrowse = {
  categories: vi.fn(async () => ({ ok: false as const })),
  browse: vi.fn(async () => ({ ok: false as const })),
  preview: vi.fn(async () => ({ ok: false as const })),
  isServed: vi.fn(() => false)
}

type Handler = (event: unknown, request?: unknown) => Promise<unknown>
const handler = (channel: string): Handler =>
  mocks.handle.mock.calls.find(([name]) => name === channel)![1] as Handler

beforeEach(() => {
  vi.clearAllMocks()
  registerRavelryIpc(
    () => service,
    () => homeBrowse
  )
})

describe('Ravelry channels', () => {
  it.each(['ravelry:status', 'ravelry:saveKey', 'ravelry:removeKey', 'ravelry:search'])(
    '%s refuses a locked panel, and any window but admin',
    async (channel) => {
      mocks.unlocked.mockImplementationOnce(() => {
        throw new Error('Admin locked')
      })
      await expect(handler(channel)(admin, {})).rejects.toThrow('Admin locked')
      await expect(handler(channel)(home, {})).rejects.toThrow('Caregiver window required')
      expect(service.saveKey).not.toHaveBeenCalled()
      expect(service.removeKey).not.toHaveBeenCalled()
      expect(service.search).not.toHaveBeenCalled()
    }
  )

  it('saves only a key Ravelry accepted, and answers with status, never the key', async () => {
    const answer = await handler('ravelry:saveKey')(admin, { username: 'read-abc', key: 'x' })
    expect(service.checkKey).toHaveBeenCalledWith('read-abc', 'x')
    expect(service.saveKey).toHaveBeenCalledWith(CHECKED)
    expect(answer).toEqual({ connected: true, canSave: true })
    expect(JSON.stringify(answer)).not.toContain(CHECKED.key)
    expect(mocks.activity).toHaveBeenCalledWith('ravelry-key-saved')
    expect(JSON.stringify(mocks.activity.mock.calls)).not.toContain('read-abc')
  })

  it('does not save a key Ravelry refused', async () => {
    vi.mocked(service.checkKey).mockRejectedValueOnce(new Error("Ravelry didn't accept that key."))
    await expect(
      handler('ravelry:saveKey')(admin, { username: 'read-abc', key: 'x' })
    ).rejects.toThrow("didn't accept")
    expect(service.saveKey).not.toHaveBeenCalled()
  })

  it('does not save the key if the panel locked while Ravelry was answering', async () => {
    mocks.unlocked
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Admin locked')
      })
    await expect(
      handler('ravelry:saveKey')(admin, { username: 'read-abc', key: 'x' })
    ).rejects.toThrow('Admin locked')
    expect(service.saveKey).not.toHaveBeenCalled()
  })

  it('does not hand search results to a panel that locked meanwhile', async () => {
    mocks.unlocked
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Admin locked')
      })
    await expect(handler('ravelry:search')(admin, { query: 'hat' })).rejects.toThrow('Admin locked')
  })

  it('tells Home when a key is saved or removed, so it can offer Find a pattern', async () => {
    await handler('ravelry:saveKey')(admin, { username: 'read-abc', key: 'x' })
    await handler('ravelry:removeKey')(admin)
    expect(mocks.home.webContents.send).toHaveBeenCalledTimes(2)
    expect(mocks.home.webContents.send).toHaveBeenCalledWith('knitting:changed', {})
  })

  it.each(['ravelry:homeCategories', 'ravelry:homeBrowse', 'ravelry:homePattern'])(
    '%s answers only Home',
    async (channel) => {
      await expect(handler(channel)(admin, {})).rejects.toThrow('Home window required')
      await expect(handler(channel)(home, {})).resolves.toEqual({ ok: false })
    }
  )

  it('removes the key', async () => {
    await handler('ravelry:removeKey')(admin)
    expect(service.removeKey).toHaveBeenCalled()
    expect(mocks.activity).toHaveBeenCalledWith('ravelry-key-removed')
  })
})
