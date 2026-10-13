import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlock: vi.fn(),
  dispatch: vi.fn(),
  clear: vi.fn(),
  snapshot: vi.fn(),
  home: { id: 1 },
  admin: { id: 2 }
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: () => ({ webContents: mocks.home }),
  getAdminWindow: () => ({ webContents: mocks.admin })
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/services/audio/audioRuntime', () => ({
  dispatchClientAudio: mocks.dispatch,
  clearAudioOwner: mocks.clear,
  getAudioCoordinator: () => ({ snapshot: mocks.snapshot })
}))
import { registerAudioIpc } from '../../src/main/ipc/audioIpc'
const id = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'
describe('audio IPC boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    registerAudioIpc()
  })
  const invoke = (name: string, sender: unknown, request?: unknown): unknown =>
    mocks.handle.mock.calls.find(([channel]) => channel === name)![1]({ sender }, request)
  it('rejects web-page senders and malformed events', () => {
    expect(() => invoke('audio:get', { id: 3 })).toThrow('unavailable')
    expect(() =>
      invoke('audio:event', mocks.home, { type: 'start', id, source: 'webPage' })
    ).toThrow('Invalid audio')
    expect(() => invoke('audio:event', mocks.home, { type: 'end', id: '../private' })).toThrow(
      'Invalid audio'
    )
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it('requires admin unlock to start sounds and prevents admin music intent changes', () => {
    mocks.unlock.mockImplementation(() => {
      throw new Error('locked')
    })
    expect(() =>
      invoke('audio:event', mocks.admin, { type: 'start', id, source: 'narration' })
    ).toThrow('locked')
    mocks.unlock.mockReset()
    expect(() => invoke('audio:event', mocks.admin, { type: 'musicStop' })).toThrow('unavailable')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it('lets a locked caregiver window release only its own sounds through the ownership layer', () => {
    mocks.unlock.mockImplementation(() => {
      throw new Error('locked')
    })
    invoke('audio:event', mocks.admin, { type: 'end', id })
    expect(mocks.dispatch).toHaveBeenCalledWith(mocks.admin, { type: 'end', id })
    invoke('audio:resetOwner', mocks.admin)
    expect(mocks.clear).toHaveBeenCalledWith(2)
    expect(mocks.unlock).not.toHaveBeenCalled()
  })
})
