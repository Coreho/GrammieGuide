import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getConfig: vi.fn(),
  getClient: vi.fn(),
  create: vi.fn(),
  sender: { id: 99, once: vi.fn(), removeListener: vi.fn() },
  list: vi.fn(),
  listen: vi.fn(),
  run: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.getConfig }))
vi.mock('../../src/main/services/ai/buddyChatClient', () => ({
  getBuddyChatClient: mocks.getClient
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('../../src/main/services/speech/ttsService', () => ({
  createTtsService: () => ({ speak: vi.fn() })
}))
vi.mock('../../src/main/services/speech/sttService', () => ({
  listenOnce: mocks.listen,
  canListen: vi.fn()
}))
vi.mock('../../src/main/services/reliability/shellExec', () => ({ runPowerShell: mocks.run }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: () => ({ webContents: mocks.sender })
}))
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
    registerBuddyIpc(() => ({ list: mocks.list }) as never)
  })

  it('rejects unknown senders, unsupported actions and disabled chat in main', async () => {
    const config = defaultConfig()
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:action')![1]
    expect(await invoke({ sender: {} }, 'goHome')).toMatchObject({ ok: false })
    expect(await invoke({ sender: mocks.sender }, 'deleteFiles')).toMatchObject({ ok: false })
    expect(await invoke({ sender: mocks.sender }, 'goHome')).toEqual({
      ok: true,
      plan: { action: 'goHome' }
    })
    config.buddy.chatEnabled = false
    expect(await invoke({ sender: mocks.sender }, 'goHome')).toMatchObject({ ok: false })
  })

  it('reads the live setting each turn and refuses chat before obtaining a client', async () => {
    const config = defaultConfig()
    config.buddy.anthropicApiKey = 'saved-key'
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:chat')![1]
    const request = { turns: [{ role: 'user', text: 'Hello' }] }
    expect(await invoke({ sender: mocks.sender }, request)).toEqual({ ok: true, reply: 'Hello!' })
    mocks.getClient.mockClear()
    mocks.create.mockClear()
    config.buddy.chatEnabled = false
    expect(await invoke({ sender: mocks.sender }, request)).toMatchObject({
      ok: false,
      reason: 'disabled'
    })
    expect(mocks.getClient).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    config.buddy.chatEnabled = true
    expect(await invoke({ sender: mocks.sender }, request)).toEqual({ ok: true, reply: 'Hello!' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('uses the key belonging to the selected provider, never the other one', async () => {
    const config = defaultConfig()
    // Both keys saved, as they would be after a caregiver has tried both.
    config.buddy.anthropicApiKey = 'anthropic-key'
    config.buddy.openrouterApiKey = 'openrouter-key'
    config.buddy.provider = 'openrouter'
    config.buddy.model = 'anthropic/claude-sonnet-5.5'
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:chat')![1]

    await invoke({ sender: mocks.sender }, { turns: [{ role: 'user', text: 'Hello' }] })
    expect(mocks.getClient).toHaveBeenCalledWith('openrouter', 'openrouter-key')
    // And the request carries the routing pin that keeps her chat at Anthropic.
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-5.5',
        provider: { only: ['Anthropic'], allow_fallbacks: false, data_collection: 'deny' }
      })
    )

    // Switching back uses the Anthropic key, and sends no OpenRouter routing.
    mocks.getClient.mockClear()
    mocks.create.mockClear()
    config.buddy.provider = 'anthropic'
    config.buddy.model = 'claude-sonnet-5-5'
    await invoke({ sender: mocks.sender }, { turns: [{ role: 'user', text: 'Hello' }] })
    expect(mocks.getClient).toHaveBeenCalledWith('anthropic', 'anthropic-key')
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('provider')
  })

  it('refuses chat when the selected provider has no key, even if the other one does', async () => {
    const config = defaultConfig()
    config.buddy.anthropicApiKey = 'anthropic-key'
    config.buddy.provider = 'openrouter'
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:chat')![1]

    expect(
      await invoke({ sender: mocks.sender }, { turns: [{ role: 'user', text: 'Hello' }] })
    ).toMatchObject({ ok: false, reason: 'no-key' })
    expect(mocks.getClient).not.toHaveBeenCalled()
  })
  it('cancels the live recognition process and rejects disabled or foreign listening requests', async () => {
    const config = defaultConfig()
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:listen')![1]
    const cancel = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:cancelListen')![1]
    mocks.listen.mockImplementation(async (run) => {
      await run('recognize', { timeoutMs: 35_000 })
      return { ok: true, text: 'open private tile name' }
    })
    let complete!: () => void
    mocks.run.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        })
    )
    expect(await invoke({ sender: {} })).toMatchObject({ ok: false })
    config.buddy.chatEnabled = false
    expect(await invoke({ sender: mocks.sender })).toMatchObject({ ok: false })
    expect(mocks.listen).not.toHaveBeenCalled()
    config.buddy.chatEnabled = true
    const pending = invoke({ sender: mocks.sender })
    const signal = mocks.run.mock.calls[0]![1].signal as AbortSignal
    cancel({ sender: {} })
    expect(signal.aborted).toBe(false)
    cancel({ sender: mocks.sender })
    expect(signal.aborted).toBe(true)
    complete()
    expect(await pending).toEqual({ ok: false, reason: 'unavailable' })
    expect(mocks.sender.removeListener).toHaveBeenCalledWith('destroyed', expect.any(Function))
  })
})
