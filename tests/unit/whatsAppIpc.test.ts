import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  isUnlocked: vi.fn(() => true),
  admin: { webContents: { mainFrame: {}, isDestroyed: () => false, send: vi.fn() } },
  home: { webContents: { mainFrame: {}, isDestroyed: () => false, send: vi.fn() } },
  quit: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle }, app: { once: mocks.quit } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/auth/adminAuth', () => ({ isAdminUnlocked: mocks.isUnlocked }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
vi.mock('../../src/main/config/store', () => ({
  getConfig: () => ({
    contacts: {
      preferred: { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
      fallback: null
    }
  })
}))

import { registerWhatsAppIpc } from '../../src/main/ipc/whatsAppIpc'
import type { IpcResponse } from '../../src/shared/ipcContract'

describe('WhatsApp IPC boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUnlocked.mockReturnValue(true)
    registerWhatsAppIpc()
  })
  const handler = <C extends 'whatsapp:state' | 'whatsapp:command'>(
    channel: C
  ): ((...args: unknown[]) => Promise<IpcResponse<C>>) =>
    mocks.handle.mock.calls.find(([name]) => name === channel)![1]
  const event = (
    contents = mocks.home.webContents
  ): {
    sender: typeof mocks.home.webContents
    senderFrame: object
  } => ({
    sender: contents,
    senderFrame: contents.mainFrame
  })

  it.each(['whatsapp:state', 'whatsapp:command'] as const)(
    'rejects remote pages and child frames for %s',
    async (channel) => {
      for (const source of [
        { sender: {}, senderFrame: {} },
        { ...event(), senderFrame: {} }
      ]) {
        await expect(
          Promise.resolve().then(() =>
            handler(channel)(source, { type: 'start', contactId: 'preferred', mode: 'voice' })
          )
        ).rejects.toThrow('GrammieGuide window required')
      }
    }
  )
  it('requires caregiver unlock for the admin window', async () => {
    mocks.unlocked.mockImplementationOnce(() => {
      throw new Error('admin unlock required')
    })
    await expect(
      Promise.resolve().then(() => handler('whatsapp:state')(event(mocks.admin.webContents)))
    ).rejects.toThrow('admin unlock required')
  })
  it('returns honest unavailable state with redacted contacts and refuses real dialing', async () => {
    const state = await handler('whatsapp:state')(event())
    expect(state.connection).toBe('unavailable')
    expect(state.availableActions).toEqual([])
    expect(state.contacts).toEqual([{ id: 'preferred', name: 'Sarah', photoId: undefined }])
    expect(JSON.stringify(state)).not.toContain('15551111111')
    const result = await handler('whatsapp:command')(event(), {
      type: 'start',
      contactId: 'preferred',
      mode: 'voice'
    })
    expect(result).toMatchObject({ ok: false, problem: 'unavailable', state: { call: null } })
  })
  it('never pushes call state into the locked admin window', async () => {
    mocks.isUnlocked.mockReturnValue(false)
    await handler('whatsapp:state')(event())
    expect(mocks.home.webContents.send).toHaveBeenCalledWith('whatsapp:changed', expect.any(Object))
    expect(mocks.admin.webContents.send).not.toHaveBeenCalled()
  })
})
