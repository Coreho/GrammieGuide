import { EventEmitter } from 'node:events'
import type { BrowserWindow, WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ options: [] as unknown[], views: [] as unknown[] }))
vi.mock('electron', () => ({
  WebContentsView: class {
    webContents: unknown
    setBounds = vi.fn()
    constructor(options: { webContents: unknown }) {
      mocks.options.push(options)
      this.webContents = options.webContents
      mocks.views.push(this)
    }
  }
}))
import { WhatsAppVideoView } from '../../src/main/services/whatsapp/whatsAppVideoView'

type Open = (details: { url: string; frameName: string }) => {
  action: string
  createWindow?: (options: unknown) => unknown
}
function fixture(): {
  video: WhatsAppVideoView
  opener: {
    isDestroyed: () => boolean
    session: object
    setWindowOpenHandler: ReturnType<typeof vi.fn>
    executeJavaScript: ReturnType<typeof vi.fn>
  }
  parent: {
    isDestroyed: () => boolean
    isVisible: ReturnType<typeof vi.fn>
    getContentSize: () => number[]
    contentView: {
      addChildView: ReturnType<typeof vi.fn>
      removeChildView: ReturnType<typeof vi.fn>
    }
  }
  supplied: EventEmitter & {
    isDestroyed: () => boolean
    close: ReturnType<typeof vi.fn>
    setWindowOpenHandler: ReturnType<typeof vi.fn>
  }
  denied: string[]
  handler: () => Open
} {
  let handler: Open = () => ({ action: 'deny' })
  const supplied = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    close: vi.fn(),
    setWindowOpenHandler: vi.fn()
  })
  const denied: string[] = []
  const opener = {
    isDestroyed: () => false,
    session: {},
    setWindowOpenHandler: vi.fn((value: Open) => {
      handler = value
    }),
    executeJavaScript: vi.fn(async (code: string) => {
      const request = JSON.parse(code.slice(code.lastIndexOf(')(') + 2, -1)) as {
        type: string
        name: string
      }
      if (request.type === 'prepare') {
        denied.push(handler({ url: 'https://evil.test/', frameName: request.name }).action)
        denied.push(handler({ url: 'about:blank', frameName: 'wrong-name' }).action)
        const response = handler({ url: 'about:blank', frameName: request.name })
        expect(response.action).toBe('allow')
        response.createWindow!({ webContents: supplied, webPreferences: { nodeIntegration: true } })
        denied.push(handler({ url: 'about:blank', frameName: request.name }).action)
      }
      return true
    })
  }
  const parent = {
    isDestroyed: () => false,
    isVisible: vi.fn(() => true),
    getContentSize: () => [1000, 800],
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  }
  const video = new WhatsAppVideoView(
    opener as unknown as WebContents,
    parent as unknown as BrowserWindow
  )
  return { video, opener, parent, supplied, denied, handler: () => handler }
}
afterEach(() => {
  mocks.options.length = 0
  mocks.views.length = 0
})

describe('owned embedded video view', () => {
  it('passes native attachment and parent visibility to the video renderer', async () => {
    const f = fixture()
    expect(await f.video.prepare()).toBe(true)
    expect(await f.video.sync('call')).toBe(true)
    expect(f.opener.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('"visible":false'),
      false
    )
    f.video.setBounds({ x: 0, y: 0, width: 600, height: 400 })
    expect(await f.video.sync('call')).toBe(true)
    expect(f.opener.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('"visible":true'),
      false
    )
    f.parent.isVisible.mockReturnValue(false)
    expect(await f.video.sync('call')).toBe(true)
    expect(f.opener.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('"visible":false'),
      false
    )
    f.parent.isVisible.mockReturnValue(true)
    f.video.setBounds(null)
    expect(await f.video.sync('call')).toBe(true)
    expect(f.opener.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('"visible":false'),
      false
    )
    f.video.close()
  })
  it('preserves Chromium supplied WebContents and hardens the one blank child', async () => {
    const f = fixture()
    const bounds = { x: 10, y: 20, width: 600, height: 400 }
    f.video.setBounds(bounds)
    expect(await f.video.prepare()).toBe(true)
    expect(mocks.options[0]).toMatchObject({
      webContents: f.supplied,
      webPreferences: {
        session: f.opener.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        disableDialogs: true
      }
    })
    expect(f.denied).toEqual(['deny', 'deny', 'deny'])
    expect(f.parent.contentView.addChildView).toHaveBeenCalledOnce()
    const view = mocks.views[0] as { setBounds: ReturnType<typeof vi.fn> }
    expect(view.setBounds).toHaveBeenNthCalledWith(1, { x: 0, y: 0, width: 600, height: 400 })
    expect(view.setBounds).toHaveBeenLastCalledWith(bounds)
    expect(f.opener.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('"initialWidth":600,"initialHeight":400'),
      true
    )
    expect(f.handler()({ url: 'about:blank', frameName: 'anything' }).action).toBe('deny')
    f.video.setBounds(null)
    expect(f.parent.contentView.removeChildView).toHaveBeenCalledOnce()
    f.video.close()
    f.video.close()
    expect(f.supplied.close).toHaveBeenCalledExactlyOnceWith({ waitForBeforeUnload: false })
  })

  it('keeps the document detached until a trusted layout is supplied', async () => {
    const f = fixture()
    expect(await f.video.prepare()).toBe(true)
    expect(f.parent.contentView.addChildView).not.toHaveBeenCalled()
    expect(f.opener.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('"initialWidth":1000,"initialHeight":800'),
      true
    )
    f.video.close()
  })

  it('contains failed renderer work and does not reopen a closed video view', async () => {
    const f = fixture()
    f.opener.executeJavaScript.mockRejectedValue(new Error('Renderer closed'))
    expect(await f.video.prepare()).toBe(false)
    expect(await f.video.prepare()).toBe(false)
    expect(f.opener.executeJavaScript).toHaveBeenCalledTimes(2) // Prepare and best-effort cleanup.
    expect(f.parent.contentView.addChildView).not.toHaveBeenCalled()
  })

  it('destroys and detaches video if its document tries to navigate', async () => {
    const f = fixture()
    f.video.setBounds({ x: 0, y: 0, width: 600, height: 400 })
    expect(await f.video.prepare()).toBe(true)
    const event = { preventDefault: vi.fn() }
    f.supplied.emit('will-navigate', event, 'https://web.whatsapp.com/')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(f.supplied.close).toHaveBeenCalledOnce()
    expect(f.parent.contentView.removeChildView).toHaveBeenCalledOnce()
    expect(await f.video.sync('call')).toBe(false)
  })
})
