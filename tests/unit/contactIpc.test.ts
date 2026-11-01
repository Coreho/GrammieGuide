import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  list: vi.fn(),
  config: vi.fn(),
  save: vi.fn(),
  admin: { webContents: { mainFrame: {} } },
  home: { webContents: { mainFrame: {} } }
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/contacts/contactRuntime', () => ({
  getContactRequests: () => ({ list: mocks.list }),
  contactNow: () => Date.now()
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.config, setConfig: mocks.save }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
import { registerContactIpc } from '../../src/main/ipc/contactIpc'

describe('saved contact outcomes IPC', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    registerContactIpc()
  })
  it('enforces the main-process caregiver gate before reading history', async () => {
    mocks.unlocked.mockImplementation(() => {
      throw new Error('admin unlock required')
    })
    await expect(mocks.handle.mock.calls[0]![1]()).rejects.toThrow('admin unlock required')
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('exposes only the read channel for a future caregiver dashboard', async () => {
    const summaries = [{ id: 'request', purpose: 'real', status: 'unknown' }]
    mocks.list.mockResolvedValue(summaries)
    expect(mocks.handle).toHaveBeenCalledTimes(7)
    expect(mocks.handle.mock.calls[0]![0]).toBe('contacts:list')
    expect(await mocks.handle.mock.calls[0]![1]()).toEqual(summaries)
  })
  it.each(['contacts:getSettings', 'contacts:saveSettings', 'admin:setContactCredentials'])(
    'rejects Home and foreign frames for %s even with admin unlocked',
    async (channel) => {
      const handler = mocks.handle.mock.calls.find(([name]) => name === channel)![1]
      await expect(
        Promise.resolve().then(() =>
          handler(
            { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame },
            {}
          )
        )
      ).rejects.toThrow('Caregiver window required')
      await expect(
        Promise.resolve().then(() =>
          handler({ sender: mocks.admin.webContents, senderFrame: {} }, {})
        )
      ).rejects.toThrow('Caregiver window required')
      expect(mocks.save).not.toHaveBeenCalled()
    }
  )
  it.each(['contacts:home', 'contacts:request', 'contacts:images'])(
    'rejects non-Home senders for %s',
    async (channel) => {
      const handler = mocks.handle.mock.calls.find(([name]) => name === channel)![1]
      await expect(
        handler({ sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame })
      ).rejects.toThrow('Home window required')
      expect(mocks.list).not.toHaveBeenCalled()
    }
  )
})
