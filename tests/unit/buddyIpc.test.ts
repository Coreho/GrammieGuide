import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getConfig: vi.fn(),
  ready: vi.fn(),
  create: vi.fn(),
  sender: { id: 99, once: vi.fn(), removeListener: vi.fn() },
  list: vi.fn(),
  listen: vi.fn(),
  run: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.getConfig }))
vi.mock('../../src/main/services/chatgpt/buddyAdapter', () => ({ chatGptBuddyReply: mocks.create }))
vi.mock('../../src/main/services/chatgpt/runtime', () => ({
  getChatGptSession: () => ({ state: mocks.ready })
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
    mocks.ready.mockReturnValue({ verifiedModel: 'account-model' })
    mocks.create.mockResolvedValue({
      text: 'Hello!',
      tools: [],
      refused: false
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
    config.buddy.model = 'account-model'
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:chat')![1]
    const request = { turns: [{ role: 'user', text: 'Hello' }] }
    expect(await invoke({ sender: mocks.sender }, request)).toEqual({ ok: true, reply: 'Hello!' })
    mocks.ready.mockClear()
    mocks.create.mockClear()
    config.buddy.chatEnabled = false
    expect(await invoke({ sender: mocks.sender }, request)).toMatchObject({
      ok: false,
      reason: 'disabled'
    })
    expect(mocks.ready).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    config.buddy.chatEnabled = true
    expect(await invoke({ sender: mocks.sender }, request)).toEqual({ ok: true, reply: 'Hello!' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('refuses an unverified model without calling inference', async () => {
    const config = defaultConfig()
    config.buddy.model = 'unverified'
    mocks.getConfig.mockReturnValue(config)
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'buddy:chat')![1]
    expect(
      await invoke({ sender: mocks.sender }, { turns: [{ role: 'user', text: 'Hello' }] })
    ).toMatchObject({ ok: false, reason: 'not-connected' })
    expect(mocks.create).not.toHaveBeenCalled()
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
