import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), unlocked: vi.fn(), list: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/contacts/contactRuntime', () => ({
  getContactRequests: () => ({ list: mocks.list })
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
    expect(mocks.handle).toHaveBeenCalledTimes(1)
    expect(mocks.handle.mock.calls[0]![0]).toBe('contacts:list')
    expect(await mocks.handle.mock.calls[0]![1]()).toEqual(summaries)
  })
})
