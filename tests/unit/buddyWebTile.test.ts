import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { defaultConfig } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  handle: vi.fn(),
  config: vi.fn(),
  launcher: vi.fn(),
  log: vi.fn(),
  views: [] as Array<{ webContents: EventEmitter }>
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: { handle: mocks.handle, on: vi.fn() },
    net: { isOnline: () => true },
    WebContentsView: class {
      constructor() {
        mocks.views.push(this)
      }
      webContents = Object.assign(new EventEmitter(), {
        loadURL: mocks.load,
        setWindowOpenHandler: vi.fn(),
        isDestroyed: () => false,
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
  logReliabilityEvent: vi.fn()
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.config }))
vi.mock('../../src/main/windows/windowManager', () => ({ getLauncherWindow: mocks.launcher }))
import {
  initEmbeddedBrowser,
  openUrlAndWait,
  closeEmbeddedBrowser
} from '../../src/main/services/browser/embeddedBrowser'
import { registerBrowserIpc } from '../../src/main/ipc/browserIpc'

describe('saved web tile opening', () => {
  const host = Object.assign(new EventEmitter(), {
    webContents: { send: vi.fn() },
    getContentSize: () => [1440, 900],
    isDestroyed: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.launcher.mockReturnValue(host)
    initEmbeddedBrowser(host as never)
  })
  afterEach(() => {
    closeEmbeddedBrowser()
    host.removeAllListeners()
    vi.useRealTimers()
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
})
