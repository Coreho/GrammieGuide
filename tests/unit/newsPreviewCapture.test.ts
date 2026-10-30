import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureNewsPreview } from '../../src/main/services/news/captureNewsPreview'

const mock = vi.hoisted(() => ({
  ready: undefined as (() => void) | undefined,
  load: vi.fn<() => Promise<void>>(),
  destroy: vi.fn(),
  construct: vi.fn(),
  muted: vi.fn(),
  capture: vi.fn(),
  harden: vi.fn(),
  // Controllable, so the guards are tested too: they are all that keeps this
  // hidden, unattended window off sites the caregiver never approved.
  allowed: vi.fn<(url: string, config: unknown, kind: string) => boolean>(),
  handlers: new Map<string, (event: { preventDefault: () => void }, target: string) => void>()
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: () => ({}) }))
vi.mock('../../src/shared/browser/approvedSites', () => ({ navigationAllowed: mock.allowed }))
vi.mock('../../src/main/services/browser/webSession', () => ({
  WEB_PARTITION: 'persist:web',
  hardenWebSession: mock.harden
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: unknown) {
      mock.construct(options)
    }
    webContents = {
      setAudioMuted: mock.muted,
      setWindowOpenHandler: vi.fn(),
      on: (
        event: string,
        handler: (event: { preventDefault: () => void }, target: string) => void
      ) => {
        mock.handlers.set(event, handler)
      },
      once: (_event: string, callback: () => void) => {
        mock.ready = callback
      },
      capturePage: mock.capture
    }
    loadURL = mock.load
    destroy = mock.destroy
    isDestroyed = (): boolean => false
  }
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mock.allowed.mockReturnValue(true)
  mock.handlers.clear()
  mock.ready = undefined
})
afterEach(() => vi.useRealTimers())

describe('News preview renderer lifetime', () => {
  it('captures a hidden sandboxed muted page and destroys it after the screenshot', async () => {
    mock.load.mockImplementation(async () => {
      mock.ready?.()
    })
    mock.capture.mockResolvedValue({
      isEmpty: () => false,
      resize: () => ({ toJPEG: () => Buffer.from('image') })
    })
    const result = captureNewsPreview('https://example.test/')
    await vi.advanceTimersByTimeAsync(500)
    expect(await result).toBe(`data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`)
    expect(mock.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        show: false,
        webPreferences: expect.objectContaining({
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: 'persist:web'
        })
      })
    )
    expect(mock.muted).toHaveBeenCalledWith(true)
    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })

  it('forcibly closes a page that never becomes ready at the ten-second deadline', async () => {
    mock.load.mockImplementation(() => new Promise(() => {}))
    const result = captureNewsPreview('https://example.test/').catch(
      (error: Error) => error.message
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await result).toBe('Preview timed out')
    expect(mock.destroy).toHaveBeenCalledTimes(1)
    expect(mock.capture).not.toHaveBeenCalled()
  })

  it('closes the page after a navigation failure, too', async () => {
    mock.load.mockRejectedValue(new Error('offline'))
    await expect(captureNewsPreview('https://example.test/')).rejects.toThrow('offline')
    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('News preview approved-site guard', () => {
  it('refuses a source the caregiver never approved without loading it', async () => {
    mock.allowed.mockReturnValue(false)
    await expect(captureNewsPreview('https://unapproved.test/')).rejects.toThrow(
      'Unapproved source'
    )
    expect(mock.allowed).toHaveBeenCalledWith('https://unapproved.test/', {}, 'open')
    expect(mock.load).not.toHaveBeenCalled()
    expect(mock.capture).not.toHaveBeenCalled()
    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })

  it('stops the page navigating or redirecting to a site that is not approved', async () => {
    mock.allowed.mockImplementation((url) => url.startsWith('https://approved.test/'))
    mock.load.mockImplementation(() => new Promise(() => {}))
    const result = captureNewsPreview('https://approved.test/').catch(
      (error: Error) => error.message
    )
    for (const name of ['will-navigate', 'will-redirect']) {
      const guard = mock.handlers.get(name)!
      const away = { preventDefault: vi.fn() }
      guard(away, 'https://elsewhere.test/landing')
      expect(away.preventDefault).toHaveBeenCalledTimes(1)
      const stay = { preventDefault: vi.fn() }
      guard(stay, 'https://approved.test/story')
      expect(stay.preventDefault).not.toHaveBeenCalled()
    }
    expect(mock.allowed).toHaveBeenCalledWith('https://elsewhere.test/landing', {}, 'redirect')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await result).toBe('Preview timed out')
    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })
})
