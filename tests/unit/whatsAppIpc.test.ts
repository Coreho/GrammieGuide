import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  isUnlocked: vi.fn(() => true),
  admin: { webContents: { mainFrame: {}, isDestroyed: () => false, send: vi.fn() } },
  home: { webContents: { mainFrame: {}, isDestroyed: () => false, send: vi.fn() } },
  quit: vi.fn(),
  watchLock: vi.fn(),
  setup: {
    state: vi.fn(() => ({ open: false, phase: 'closed' })),
    open: vi.fn(() => ({ open: true, phase: 'loading' })),
    close: vi.fn(() => ({ open: false, phase: 'closed' })),
    closeSetup: vi.fn(() => ({ open: false, phase: 'closed' })),
    prepare: vi.fn(),
    setVideoBounds: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn()
  }
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle }, app: { once: mocks.quit } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/auth/adminAuth', () => ({
  isAdminUnlocked: mocks.isUnlocked,
  onAdminLocked: (listener: () => void) => {
    mocks.watchLock(listener)
    return () => {}
  }
}))
vi.mock('../../src/main/services/whatsapp/whatsAppSession', () => ({
  EmbeddedWhatsAppSession: class {
    state = mocks.setup.state
    open = mocks.setup.open
    close = mocks.setup.close
    closeSetup = mocks.setup.closeSetup
    prepare = mocks.setup.prepare
    setVideoBounds = mocks.setup.setVideoBounds
    subscribe = mocks.setup.subscribe
    dispose = mocks.setup.dispose
  }
}))
vi.mock('../../src/main/services/audio/audioRuntime', () => ({
  getAudioCoordinator: () => ({ dispatch: vi.fn() })
}))
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
  const handler = <
    C extends
      | 'whatsapp:state'
      | 'whatsapp:command'
      | 'whatsapp:setupState'
      | 'whatsapp:openSetup'
      | 'whatsapp:closeSetup'
      | 'whatsapp:videoBounds'
  >(
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
  it('allows only Home to place the video and rejects malformed or overflowing bounds', async () => {
    const home = mocks.home as typeof mocks.home & { getContentSize: () => number[] }
    home.getContentSize = () => [1200, 800]
    const bounds = { x: 100, y: 100, width: 900, height: 500 }
    await handler('whatsapp:videoBounds')(event(), bounds)
    expect(mocks.setup.setVideoBounds).toHaveBeenLastCalledWith(bounds)
    await handler('whatsapp:videoBounds')(event(), null)
    expect(mocks.setup.setVideoBounds).toHaveBeenLastCalledWith(null)
    for (const source of [event(mocks.admin.webContents), { ...event(), senderFrame: {} }])
      await expect(
        Promise.resolve().then(() => handler('whatsapp:videoBounds')(source, bounds))
      ).rejects.toThrow('Home window required')
    for (const invalid of [
      { ...bounds, x: -1 },
      { ...bounds, width: 1201 },
      { ...bounds, x: 500 },
      { ...bounds, height: 0 },
      { ...bounds, url: 'https://evil.test' }
    ])
      await expect(
        Promise.resolve().then(() => handler('whatsapp:videoBounds')(event(), invalid))
      ).rejects.toThrow()
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
  it.each(['whatsapp:setupState', 'whatsapp:openSetup', 'whatsapp:closeSetup'] as const)(
    'allows only the unlocked caregiver main frame to use %s',
    async (channel) => {
      await expect(Promise.resolve().then(() => handler(channel)(event()))).rejects.toThrow(
        'Caregiver window required'
      )
      await expect(
        Promise.resolve().then(() =>
          handler(channel)({ ...event(mocks.admin.webContents), senderFrame: {} })
        )
      ).rejects.toThrow('Caregiver window required')
      mocks.unlocked.mockImplementationOnce(() => {
        throw new Error('admin unlock required')
      })
      await expect(
        Promise.resolve().then(() => handler(channel)(event(mocks.admin.webContents)))
      ).rejects.toThrow('admin unlock required')
    }
  )
  it('opens setup only in the caregiver context and closes it immediately on lock', async () => {
    expect(await handler('whatsapp:openSetup')(event(mocks.admin.webContents))).toEqual({
      open: true,
      phase: 'loading'
    })
    expect(mocks.setup.open).toHaveBeenCalledWith(mocks.admin)
    mocks.watchLock.mock.calls[0]![0]()
    expect(mocks.setup.closeSetup).toHaveBeenCalledTimes(1)
  })
})
