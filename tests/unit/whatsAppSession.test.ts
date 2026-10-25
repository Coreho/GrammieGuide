import type { BrowserWindow } from 'electron'
import type { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

type Contents = EventEmitter & {
  loadURL: Mock
  close: Mock
  executeJavaScriptInIsolatedWorld: Mock
  executeJavaScript: Mock
  setWindowOpenHandler: Mock
  isDestroyed: () => boolean
  getURL: () => string
}
type Host = EventEmitter & {
  webContents: Contents
  loadURL: Mock
  contentView: { addChildView: Mock; removeChildView: Mock }
  getContentSize: () => number[]
  isDestroyed: () => boolean
  close: Mock
  focus: Mock
}
type View = { webContents: Contents; setBounds: Mock }
const mocks = vi.hoisted(() => ({
  hosts: [] as unknown[],
  views: [] as unknown[],
  partition: vi.fn(),
  ses: {
    getUserAgent: vi.fn(
      () =>
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) grammieguide/0.1.0 Chrome/150.0.0.0 Electron/44.4.5 Safari/537.36'
    ),
    setUserAgent: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const contents = (): Contents => {
    let destroyed = false
    const value = Object.assign(new EventEmitter(), {
      loadURL: vi.fn(async () => undefined),
      executeJavaScriptInIsolatedWorld: vi.fn(async () => 'link-required'),
      executeJavaScript: vi.fn(async () => ({ supported: true, idle: true, call: null })),
      setWindowOpenHandler: vi.fn(),
      getURL: () => 'https://web.whatsapp.com/',
      isDestroyed: () => destroyed,
      close: vi.fn(() => {
        destroyed = true
      })
    })
    return value
  }
  class FakeHost extends EventEmitter {
    webContents = contents()
    loadURL = vi.fn(async () => undefined)
    contentView = { addChildView: vi.fn(), removeChildView: vi.fn() }
    getContentSize = (): number[] => [1000, 800]
    isDestroyed = (): boolean => this.destroyed
    destroyed = false
    focus = vi.fn()
    show = vi.fn()
    showInactive = vi.fn()
    setIgnoreMouseEvents = vi.fn()
    close = vi.fn(() => {
      this.destroyed = true
      this.emit('closed')
    })
    constructor(options: unknown) {
      super()
      mocks.hosts.push(this)
      hostOptions(options)
    }
  }
  const hostOptions = vi.fn()
  class FakeView {
    webContents = contents()
    setBounds = vi.fn()
    constructor(options: unknown) {
      mocks.views.push(this)
      viewOptions(options)
    }
  }
  const viewOptions = vi.fn()
  return {
    BrowserWindow: FakeHost,
    WebContentsView: FakeView,
    session: {
      fromPartition: (partition: string) => {
        mocks.partition(partition)
        return mocks.ses
      }
    }
  }
})

import { EmbeddedWhatsAppSession } from '../../src/main/services/whatsapp/whatsAppSession'

const sessions: EmbeddedWhatsAppSession[] = []
const make = (): { setup: EmbeddedWhatsAppSession; host: () => Host; view: () => View } => {
  const setup = new EmbeddedWhatsAppSession()
  sessions.push(setup)
  return { setup, host: () => mocks.hosts.at(-1) as Host, view: () => mocks.views.at(-1) as View }
}
afterEach(() => {
  sessions.splice(0).forEach((value) => value.dispose())
  vi.clearAllMocks()
})

describe('embedded WhatsApp account setup', () => {
  it('leases only audio to its owned call main frame and keeps admin setup-close separate', async () => {
    const f = make()
    f.setup.open(undefined, true)
    expect(f.setup.callsOpen).toBe(true)
    expect(f.setup.state().open).toBe(false)
    const check = mocks.ses.setPermissionCheckHandler.mock.calls[0]![0]
    const request = mocks.ses.setPermissionRequestHandler.mock.calls[0]![0]
    const contents = f.view().webContents
    const origin = 'https://web.whatsapp.com/'
    const details = { isMainFrame: true, mediaType: 'audio' }
    expect(check(contents, 'media', origin, details)).toBe(false)
    f.setup.allowMicrophone(true)
    expect(check(contents, 'media', origin, details)).toBe(true)
    expect(check(contents, 'media', origin, { ...details, mediaType: 'video' })).toBe(false)
    expect(check(contents, 'media', origin, { ...details, isMainFrame: false })).toBe(false)
    expect(check(contents, 'media', 'https://evil.test/', details)).toBe(false)
    expect(check({}, 'media', origin, details)).toBe(false)
    const callback = vi.fn()
    request(contents, 'media', callback, {
      isMainFrame: true,
      requestingUrl: origin,
      mediaTypes: ['audio']
    })
    expect(callback).toHaveBeenLastCalledWith(true)
    request(contents, 'media', callback, {
      isMainFrame: true,
      requestingUrl: origin,
      mediaTypes: ['audio', 'video']
    })
    expect(callback).toHaveBeenLastCalledWith(false)
    await f.setup.run({ type: 'read' }, new AbortController().signal)
    expect(contents.executeJavaScript).toHaveBeenLastCalledWith(expect.any(String), false)
    f.setup.closeSetup()
    expect(f.setup.callsOpen).toBe(true)
    f.setup.close()
    expect(f.setup.locallyClosed).toBe(true)
    expect(check(contents, 'media', origin, details)).toBe(false)
  })
  it('loads only on an explicit open, in a persistent isolated session with capture denied', async () => {
    const f = make()
    expect(mocks.partition).not.toHaveBeenCalled()
    f.setup.open(undefined)
    await vi.waitFor(() => expect(f.setup.state().phase).toBe('link-required'))
    expect(mocks.partition).toHaveBeenCalledWith('persist:whatsapp')
    expect(mocks.ses.setUserAgent).toHaveBeenCalledWith(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
    )
    expect(f.view().webContents.loadURL).toHaveBeenCalledWith('https://web.whatsapp.com/')
    expect(mocks.ses.setPermissionCheckHandler.mock.calls[0]![0]()).toBe(false)
    const callback = vi.fn()
    mocks.ses.setPermissionRequestHandler.mock.calls[0]![0]({}, 'media', callback, {})
    expect(callback).toHaveBeenCalledWith(false)
    const event = { preventDefault: vi.fn() }
    mocks.ses.on.mock.calls.find(([name]) => name === 'will-download')![1](event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('blocks external navigation and popups without opening another app', () => {
    const f = make()
    f.setup.open(undefined)
    for (const url of [
      'https://evil.test/',
      'whatsapp://newcall',
      'file:///C:/secret',
      'https://web.whatsapp.com.evil.test/'
    ]) {
      const event = { preventDefault: vi.fn() }
      f.view().webContents.emit('will-navigate', event, url)
      expect(event.preventDefault).toHaveBeenCalled()
    }
    expect(f.view().webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({
      action: 'deny'
    })
  })

  it('reports only a link phase, never page text, account IDs or QR data', async () => {
    const f = make()
    const changed = vi.fn()
    f.setup.subscribe(changed)
    f.setup.open(undefined)
    await vi.waitFor(() => expect(f.setup.state().phase).toBe('link-required'))
    f.view().webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue('linked')
    f.view().webContents.emit('dom-ready')
    await vi.waitFor(() => expect(f.setup.state().phase).toBe('linked'))
    expect(f.setup.state()).toEqual({ open: true, phase: 'linked' })
    f.view().webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue({ token: 'secret' })
    f.view().webContents.emit('dom-ready')
    await vi.waitFor(() => expect(f.setup.state().phase).toBe('unavailable'))
    expect(JSON.stringify(changed.mock.calls)).not.toContain('secret')
  })

  it('reuses the setup window and fully closes the remote contents on close', () => {
    const f = make()
    f.setup.open(undefined)
    const host = f.host()
    const view = f.view()
    const count = mocks.hosts.length
    f.setup.open(undefined)
    expect(mocks.hosts).toHaveLength(count)
    f.setup.close()
    expect(host.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(view.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    expect(f.setup.state().open).toBe(false)
  })

  it('closes on parent destruction and ignores a late probe from an old page', async () => {
    const f = make()
    f.setup.open(undefined)
    const parent = f.host()
    f.setup.close()
    f.setup.open(parent as unknown as BrowserWindow)
    await vi.waitFor(() => expect(f.setup.state().phase).toBe('link-required'))
    let finish: (value: string) => void = () => {}
    f.view().webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )
    f.view().webContents.emit('dom-ready')
    await vi.waitFor(() =>
      expect(f.view().webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalled()
    )
    parent.webContents.emit('render-process-gone')
    finish('linked')
    await Promise.resolve()
    expect(f.setup.state().open).toBe(false)
    expect(f.setup.state().phase).not.toBe('linked')
  })
})
