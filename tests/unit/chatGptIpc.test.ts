import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  session: vi.fn(),
  cancel: vi.fn(),
  locked: vi.fn(),
  appOn: vi.fn(),
  open: vi.fn(),
  admin: { webContents: { mainFrame: {} } },
  home: { webContents: { mainFrame: {} } }
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  app: { on: mocks.appOn },
  shell: { openExternal: mocks.open }
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/auth/adminAuth', () => ({ onAdminLocked: mocks.locked }))
vi.mock('../../src/main/windows/windowManager', () => ({ getAdminWindow: () => mocks.admin }))
vi.mock('../../src/main/services/chatgpt/runtime', () => ({
  getChatGptSession: mocks.session,
  cancelChatGptLogin: mocks.cancel
}))
import { registerChatGptIpc } from '../../src/main/ipc/chatGptIpc'

describe('ChatGPT caregiver boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    registerChatGptIpc()
  })
  it.each([
    'chatgpt:state',
    'chatgpt:connect',
    'chatgpt:cancel',
    'chatgpt:select',
    'chatgpt:models',
    'chatgpt:test',
    'chatgpt:welcome',
    'chatgpt:signOut',
    'chatgpt:usage'
  ])(
    'rejects locked admin, Home, and foreign frames for %s before accessing credentials',
    async (channel) => {
      const handler = mocks.handle.mock.calls.find(([name]) => name === channel)![1]
      mocks.unlocked.mockImplementationOnce(() => {
        throw Error('locked')
      })
      await expect(
        Promise.resolve().then(() =>
          handler(
            { sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame },
            {}
          )
        )
      ).rejects.toThrow('locked')
      for (const event of [
        { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame },
        { sender: mocks.admin.webContents, senderFrame: {} }
      ])
        await expect(Promise.resolve().then(() => handler(event, {}))).rejects.toThrow(
          'caregiver panel'
        )
      expect(mocks.session).not.toHaveBeenCalled()
      expect(mocks.open).not.toHaveBeenCalled()
    }
  )
  it('cancels the callback on lock and app quit and opens only the fixed usage URL', () => {
    expect(mocks.locked).toHaveBeenCalledWith(mocks.cancel)
    expect(mocks.appOn).toHaveBeenCalledWith('before-quit', mocks.cancel)
    const handler = mocks.handle.mock.calls.find(([name]) => name === 'chatgpt:usage')![1]
    handler({ sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame })
    expect(mocks.open).toHaveBeenCalledWith('https://chatgpt.com/settings/usage')
  })
})
