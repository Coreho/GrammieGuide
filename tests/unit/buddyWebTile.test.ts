import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { defaultConfig } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  handle: vi.fn(),
  config: vi.fn(),
  launcher: vi.fn(),
  log: vi.fn(),
  reliability: vi.fn(),
  requireAdmin: vi.fn(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
  url: 'https://saved.example',
  views: [] as Array<{ webContents: EventEmitter }>
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: {
      handle: mocks.handle,
      on: (channel: string, cb: (...args: unknown[]) => void) => mocks.listeners.set(channel, cb)
    },
    net: { isOnline: () => true },
    WebContentsView: class {
      constructor() {
        mocks.views.push(this)
      }
      webContents = Object.assign(new EventEmitter(), {
        loadURL: mocks.load,
        setWindowOpenHandler: vi.fn(),
        isDestroyed: () => false,
        send: vi.fn(),
        getURL: () => mocks.url,
        close: vi.fn()
      })
      setBounds = vi.fn()
      setVisible = vi.fn()
    }
  }
})
vi.mock('../../src/main/services/browser/webSession', () => ({
  WEB_PARTITION: 'test',
  hardenWebSession: vi.fn()
}))
vi.mock('../../src/main/services/audio/pageAudio', () => ({ wirePageAudio: () => vi.fn() }))
vi.mock('../../src/main/services/audio/audioRuntime', () => ({ getAudioCoordinator: vi.fn() }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.log }))
vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({
  logReliabilityEvent: mocks.reliability
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({
  requireAdminUnlocked: mocks.requireAdmin
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.config }))
vi.mock('../../src/main/windows/windowManager', () => ({ getLauncherWindow: mocks.launcher }))
import {
  initEmbeddedBrowser,
  openUrl,
  getPageProblem,
  dismissBlocked,
  openUrlAndWait,
  closeEmbeddedBrowser
} from '../../src/main/services/browser/embeddedBrowser'
import { registerBrowserIpc } from '../../src/main/ipc/browserIpc'

describe('saved web tile opening', () => {
  const host = Object.assign(new EventEmitter(), {
    webContents: { send: vi.fn(), isDestroyed: () => false },
    getContentSize: () => [1440, 900],
    isDestroyed: vi.fn(() => false),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  })
  beforeEach(() => {
    vi.clearAllMocks()
    host.isDestroyed.mockReturnValue(false)
    mocks.url = 'https://saved.example'
    mocks.config.mockReturnValue({ ...defaultConfig(), approvedSites: ['saved.example'] })
    mocks.requireAdmin.mockImplementation(() => undefined)
    mocks.launcher.mockReturnValue(host)
    initEmbeddedBrowser(host as never)
  })
  afterEach(() => {
    closeEmbeddedBrowser()
    host.removeAllListeners()
    vi.useRealTimers()
  })
  it('closes cleanly after its host window has already been destroyed', () => {
    mocks.load.mockResolvedValue(undefined)
    openUrl('https://saved.example')
    mocks.url = 'https://www.youtube.com/watch?v=fixture'
    const contents = mocks.views.at(-1)!.webContents
    mocks.listeners.get('browserView:videoState')!(
      { sender: contents },
      {
        available: true,
        paused: true,
        fullscreen: false,
        canRewind: true
      }
    )
    host.isDestroyed.mockReturnValue(true)
    expect(() => host.emit('closed')).not.toThrow()
    host.isDestroyed.mockReturnValue(false)
  })
  it('refuses media and reader commands from other windows and child frames', async () => {
    registerBrowserIpc()
    for (const channel of ['browser:videoCommand', 'browser:readerMode']) {
      const invoke = mocks.handle.mock.calls.find(([name]) => name === channel)![1]
      expect(
        await invoke({ sender: {} }, channel === 'browser:readerMode' ? 'article' : 'play')
      ).toBe(false)
      expect(await invoke({ sender: host.webContents, senderFrame: {} }, 'play')).toBe(false)
    }
  })
  it('does not report success until Electron finishes loading and keeps targets private', async () => {
    let finish!: () => void
    mocks.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const result = vi.fn()
    const opening = openUrlAndWait('https://saved.example/private-label').then(result)
    await Promise.resolve()
    expect(result).not.toHaveBeenCalled()
    finish()
    await opening
    expect(result).toHaveBeenCalledWith('loaded')
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('private-label')
  })
  it('reports a failed load only when the recovery screen took over', async () => {
    let fail!: () => void
    mocks.load.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = () => reject(new Error('ERR_CONNECTION_REFUSED'))
        })
    )
    const failing = openUrlAndWait('https://saved.example')
    await Promise.resolve()
    // Chromium reports the failure first; Home's recovery screen shows instead of the page.
    mocks.views
      .at(-1)!
      .webContents.emit(
        'did-fail-load',
        {},
        -102,
        'ERR_CONNECTION_REFUSED',
        'https://saved.example',
        true
      )
    fail()
    expect(await failing).toBe('failed')
  })
  it('claims neither success nor failure for a replaced load, a slow page or closing Home', async () => {
    // ERR_ABORTED from a redirect: no failure was recorded, so nothing is known yet.
    mocks.load.mockRejectedValueOnce(new Error('ERR_ABORTED'))
    expect(await openUrlAndWait('https://saved.example')).toBe('pending')
    vi.useFakeTimers()
    mocks.load.mockImplementationOnce(() => new Promise(() => undefined))
    const timed = openUrlAndWait('https://saved.example')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await timed).toBe('pending')
    let finish!: () => void
    mocks.load.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const cancelled = openUrlAndWait('https://saved.example')
    closeEmbeddedBrowser()
    finish()
    expect(await cancelled).toBe('pending')
  })
  it('the IPC accepts only visible saved IDs from Home and ignores no extra target fields', async () => {
    const config = defaultConfig()
    config.tiles = [
      {
        id: 'web',
        label: 'Private label',
        type: 'web',
        url: 'https://saved.example',
        slot: 0,
        size: 'normal',
        colorIndex: 0
      }
    ]
    mocks.config.mockReturnValue(config)
    mocks.load.mockResolvedValue(undefined)
    registerBrowserIpc()
    const invoke = mocks.handle.mock.calls.find(([channel]) => channel === 'browser:openTile')![1]
    for (const req of [
      { url: 'https://evil.test' },
      { tileId: 'web', url: 'https://evil.test' },
      { tileId: 'unknown' },
      { tileId: 'C:\\evil.exe' }
    ]) {
      expect(await invoke({ sender: host.webContents }, req)).toBe('refused')
    }
    expect(await invoke({ sender: {} }, { tileId: 'web' })).toBe('refused')
    expect(mocks.load).not.toHaveBeenCalled()
    expect(await invoke({ sender: host.webContents }, { tileId: 'web' })).toBe('loaded')
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith('https://saved.example')
    config.tiles[0]!.slot = null
    expect(await invoke({ sender: host.webContents }, { tileId: 'web' })).toBe('refused')
  })

  it('blocks fresh main-frame redirects, retains recovery after aborted loads and returns Home when no page committed', async () => {
    mocks.load.mockResolvedValue(undefined)
    openUrl('https://saved.example')
    const contents = mocks.views.at(-1)!.webContents
    const event = { preventDefault: vi.fn() }
    contents.emit('will-redirect', event, 'https://blocked.example/private?secret=1', false, true)
    contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://saved.example', true)
    contents.emit('did-finish-load')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(getPageProblem()).toBe('blocked')
    expect(mocks.log).toHaveBeenCalledWith('browser-navigation-blocked', 'blocked.example')
    expect(JSON.stringify(mocks.reliability.mock.calls)).not.toContain('secret')
    dismissBlocked()
    expect(host.webContents.send).toHaveBeenCalledWith('browser:return-home', {})
  })

  it('leaves child-frame navigations and redirects alone but guards frame-initiated top navigation', () => {
    mocks.load.mockResolvedValue(undefined)
    openUrl('https://saved.example')
    const contents = mocks.views.at(-1)!.webContents
    const event = { preventDefault: vi.fn(), isMainFrame: false, url: 'https://blocked.example' }
    contents.emit('will-frame-navigate', event)
    contents.emit('will-redirect', event, event.url, false, false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(getPageProblem()).toBeNull()
    contents.emit('will-frame-navigate', { ...event, isMainFrame: true })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(getPageProblem()).toBe('blocked')
  })

  it('keeps private News block and load-failure addresses out of both logs', () => {
    mocks.load.mockResolvedValue(undefined)
    const story = 'https://private-story.example/secret'
    openUrl(story, { privateNavigation: true, trustedInitialPage: true })
    const contents = mocks.views.at(-1)!.webContents
    contents.emit('did-navigate', {}, story)
    contents.emit(
      'will-navigate',
      { preventDefault: vi.fn() },
      'https://private-link.example/private?secret=1'
    )
    expect(getPageProblem()).toBe('blocked')
    dismissBlocked()
    expect(getPageProblem()).toBeNull()
    contents.emit('will-redirect', { preventDefault: vi.fn() }, story, false, true)
    expect(getPageProblem()).toBe('blocked')
    openUrl(story, { privateNavigation: true, trustedInitialPage: true })
    contents.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', story, true)
    const logs = JSON.stringify([mocks.log.mock.calls, mocks.reliability.mock.calls])
    expect(logs).not.toContain('https:')
    expect(logs).not.toContain('private-story.example')
    expect(logs).not.toContain('private-link.example')
  })

  it('does not grant an exception just because a normal open requests private logs', () => {
    mocks.load.mockResolvedValue(undefined)
    openUrl('https://unapproved.example', { privateNavigation: true })
    expect(mocks.load).not.toHaveBeenCalled()
    expect(getPageProblem()).toBe('blocked')
  })

  it('requires an unlocked admin before reading blocked domains', () => {
    registerBrowserIpc()
    const invoke = mocks.handle.mock.calls.find(
      ([channel]) => channel === 'browser:blockedSites'
    )![1]
    mocks.requireAdmin.mockImplementation(() => {
      throw new Error('admin unlock required')
    })
    expect(() => invoke()).toThrow('admin unlock required')
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
  })
})
