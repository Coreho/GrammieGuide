import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getConfig: vi.fn(),
  getClient: vi.fn(),
  create: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.getConfig }))
vi.mock('../../src/main/services/ai/anthropicClient', () => ({
  getAnthropicClient: mocks.getClient
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('../../src/main/services/speech/ttsService', () => ({
  createTtsService: () => ({ speak: vi.fn() })
}))
vi.mock('../../src/main/services/speech/sttService', () => ({
  listenOnce: vi.fn(),
  canListen: vi.fn()
}))
vi.mock('../../src/main/windows/windowManager', () => ({ getLauncherWindow: vi.fn() }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: vi.fn() }))
import { registerBuddyIpc } from '../../src/main/ipc/buddyIpc'

describe('buddy:chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClient.mockReturnValue({ messages: { create: mocks.create } })
    mocks.create.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn'
    })
    registerBuddyIpc()
  })

  it('reads the live setting each turn and refuses chat before obtaining an Anthropic client', async () => {
    const config = defaultConfig()
    config.buddy.anthropicApiKey = 'saved-key'
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:chat')![1]
    const request = { turns: [{ role: 'user', text: 'Hello' }] }
    expect(await invoke({}, request)).toEqual({ ok: true, reply: 'Hello!' })
    mocks.getClient.mockClear()
    mocks.create.mockClear()
    config.buddy.chatEnabled = false
    expect(await invoke({}, request)).toMatchObject({ ok: false, reason: 'disabled' })
    expect(mocks.getClient).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    config.buddy.chatEnabled = true
    expect(await invoke({}, request)).toEqual({ ok: true, reply: 'Hello!' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
})
