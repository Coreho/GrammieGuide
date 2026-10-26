// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { whatsAppVideoRuntime } from '../../src/shared/whatsAppVideo'

afterEach(() => {
  whatsAppVideoRuntime({ type: 'close', name: 'owned-video' })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture(): {
  doc: Document
  child: {
    closed: boolean
    devicePixelRatio: number
    close: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }
  registry: {
    getRendererType: () => number
    registerVideoCanvas: ReturnType<typeof vi.fn>
    unregisterVideoCanvas: ReturnType<typeof vi.fn>
    assignSourceToCanvas: ReturnType<typeof vi.fn>
    onCanvasResize: ReturnType<typeof vi.fn>
    setCoverFit: ReturnType<typeof vi.fn>
    resumeRenderingForSource: ReturnType<typeof vi.fn>
    pauseRenderingForSource: ReturnType<typeof vi.fn>
    hasRenderedFirstFrameForCanvas: (canvas: HTMLCanvasElement) => boolean
  }
  source: { self: ReturnType<typeof vi.fn>; peer: ReturnType<typeof vi.fn> }
  call: {
    id: string
    isVideo: boolean
    peerJid: string
    peerVideoJid: string
    peerVideoState: string
    selfVideoState: string
  }
  modules: Record<string, unknown>
  open: ReturnType<typeof vi.fn>
  setRendered: (value: boolean) => void
  receiveFrame: () => void
} {
  const doc = document.implementation.createHTMLDocument('Fixture')
  doc.body.textContent = 'Provider chat that must never be copied'
  const child = {
    document: doc,
    closed: false,
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(() => {
      child.closed = true
    })
  }
  const open = vi.fn(() => child)
  let rendered = false
  const paused = new Set<unknown>()
  const frames = new Set<HTMLCanvasElement>()
  const registry = {
    getRendererType: () => 1,
    registerVideoCanvas: vi.fn(),
    unregisterVideoCanvas: vi.fn(),
    assignSourceToCanvas: vi.fn(),
    onCanvasResize: vi.fn(),
    setCoverFit: vi.fn(),
    resumeRenderingForSource: vi.fn((source: unknown) => {
      paused.delete(source)
    }),
    pauseRenderingForSource: vi.fn((source: unknown) => {
      paused.add(source)
    }),
    hasRenderedFirstFrameForCanvas: (canvas: HTMLCanvasElement) => rendered || frames.has(canvas)
  }
  const self = {}
  const peers = new Map<unknown, object>()
  const source = {
    self: vi.fn(() => self),
    peer: vi.fn((peer: unknown) => {
      if (!peers.has(peer)) {
        const source = {}
        peers.set(peer, source)
        paused.add(source) // Hidden provider UI has paused incoming video.
      }
      return peers.get(peer)
    })
  }
  const call = {
    id: 'provider-call',
    isVideo: true,
    peerJid: 'call-peer',
    peerVideoJid: 'video-peer',
    peerVideoState: 'on',
    selfVideoState: 'on'
  }
  const modules: Record<string, unknown> = {
    WAWebVoipVideoRendererRegistry: { videoRendererRegistry: registry },
    WAWebVoipVideoRenderSource: {
      WAWebVoipVideoRenderSource: source,
      WAWebVoipVideoRenderStream: { CAMERA: 'camera' }
    },
    WAWebCallCollection: { activeCall: call },
    WAWebVoipVideoStateUtils: { isVideoMuted: (value: unknown) => value === 'off' }
  }
  vi.stubGlobal('location', { origin: 'https://web.whatsapp.com' })
  vi.stubGlobal('require', (name: string) => modules[name])
  vi.stubGlobal('open', open)
  return {
    doc,
    child,
    registry,
    source,
    call,
    modules,
    open,
    setRendered: (value: boolean) => {
      rendered = value
    },
    receiveFrame: () => {
      for (const [binding] of registry.assignSourceToCanvas.mock.calls as [
        { canvas: HTMLCanvasElement; source: unknown }
      ][]) {
        if (!paused.has(binding.source)) frames.add(binding.canvas)
      }
    }
  }
}

const prepare = (): boolean =>
  whatsAppVideoRuntime({
    type: 'prepare',
    name: 'owned-video',
    initialWidth: 960,
    initialHeight: 540
  })
const sync = (visible = true): boolean =>
  whatsAppVideoRuntime({ type: 'sync', name: 'owned-video', callId: 'provider-call', visible })

describe('neutral WhatsApp video canvases', () => {
  it('creates only our two canvases in the one blank child and cleans both registrations', () => {
    const f = fixture()
    expect(prepare()).toBe(true)
    expect(f.open).toHaveBeenCalledExactlyOnceWith('about:blank', 'owned-video')
    expect(f.doc.body.textContent).not.toContain('Provider chat')
    expect(f.doc.querySelectorAll('canvas')).toHaveLength(2)
    expect(f.registry.registerVideoCanvas.mock.calls.every((args) => args[1] === true)).toBe(true)
    expect(f.registry.assignSourceToCanvas).not.toHaveBeenCalled()
    expect(prepare()).toBe(true)
    expect(f.open).toHaveBeenCalledOnce()
    expect(whatsAppVideoRuntime({ type: 'close', name: 'owned-video' })).toBe(true)
    expect(f.registry.unregisterVideoCanvas).toHaveBeenCalledTimes(2)
    expect(f.child.close).toHaveBeenCalledOnce()
    expect(f.child.removeEventListener).toHaveBeenCalledExactlyOnceWith(
      'resize',
      expect.any(Function)
    )
  })

  it('binds camera sources once and rebinds only a changed video identity', () => {
    const f = fixture()
    expect(prepare()).toBe(true)
    expect(
      whatsAppVideoRuntime({ type: 'sync', name: 'owned-video', callId: 'stale', visible: true })
    ).toBe(false)
    expect(f.registry.assignSourceToCanvas).not.toHaveBeenCalled()
    expect(sync()).toBe(true)
    expect(f.source.peer).toHaveBeenLastCalledWith('video-peer', 'camera')
    expect(f.registry.assignSourceToCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ mirror: true })
    )
    expect(sync()).toBe(true)
    expect(f.registry.assignSourceToCanvas).toHaveBeenCalledTimes(2)
    f.call.peerVideoJid = 'changed-video-peer'
    expect(sync()).toBe(true)
    expect(f.registry.assignSourceToCanvas).toHaveBeenCalledTimes(3)
  })

  it('resumes remote video paused by the hidden provider only while our view is visible', () => {
    const f = fixture()
    expect(prepare()).toBe(true)
    expect(sync(false)).toBe(true)
    const [remote, self] = Array.from(f.doc.querySelectorAll('canvas'))
    const remoteSource = f.source.peer.mock.results[0]!.value
    const selfSource = f.source.self.mock.results[0]!.value
    f.receiveFrame()
    expect(sync(false)).toBe(true)
    expect(remote!.style.visibility).toBe('hidden')
    expect(self!.style.visibility).toBe('visible')
    expect(f.registry.pauseRenderingForSource).toHaveBeenLastCalledWith(remoteSource)
    expect(
      f.registry.pauseRenderingForSource.mock.calls.some(([source]) => source === selfSource)
    ).toBe(false)
    expect(sync(true)).toBe(true)
    expect(remote!.style.visibility).toBe('hidden') // Resuming is not proof of a frame.
    f.receiveFrame()
    expect(sync(true)).toBe(true)
    expect(remote!.style.visibility).toBe('visible')
    // A later hidden provider UI effect must not permanently pause our video.
    f.registry.pauseRenderingForSource(remoteSource)
    const resumed = f.registry.resumeRenderingForSource.mock.calls.length
    expect(sync(true)).toBe(true)
    expect(f.registry.resumeRenderingForSource).toHaveBeenCalledTimes(resumed + 1)
    expect(f.registry.resumeRenderingForSource).toHaveBeenLastCalledWith(remoteSource)
    expect(
      f.registry.resumeRenderingForSource.mock.calls.some(([source]) => source === selfSource)
    ).toBe(false)
    expect(sync(false)).toBe(true)
    expect(f.registry.pauseRenderingForSource).toHaveBeenLastCalledWith(remoteSource)
    f.registry.pauseRenderingForSource.mockClear()
    f.registry.resumeRenderingForSource.mockClear()
    expect(
      whatsAppVideoRuntime({ type: 'sync', name: 'owned-video', callId: 'stale', visible: true })
    ).toBe(false)
    expect(f.registry.pauseRenderingForSource).not.toHaveBeenCalled()
    expect(f.registry.resumeRenderingForSource).not.toHaveBeenCalled()
  })

  it('resizes only when canvas dimensions or display density actually change', () => {
    const f = fixture()
    const geometry = vi
      .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 640, 360))
    expect(prepare()).toBe(true)
    expect(f.registry.onCanvasResize).toHaveBeenCalledTimes(2)
    f.registry.onCanvasResize.mockClear()
    expect(sync()).toBe(true)
    expect(sync()).toBe(true)
    expect(f.registry.onCanvasResize).not.toHaveBeenCalled()
    geometry.mockReturnValue(new DOMRect(0, 0, 800, 450))
    expect(sync()).toBe(true)
    expect(f.registry.onCanvasResize).toHaveBeenCalledTimes(2)
    expect(f.registry.onCanvasResize).toHaveBeenLastCalledWith(expect.anything(), 800, 450)
    f.child.devicePixelRatio = 2
    expect(sync()).toBe(true)
    expect(f.registry.onCanvasResize).toHaveBeenCalledTimes(4)
    expect(f.registry.onCanvasResize).toHaveBeenLastCalledWith(expect.anything(), 1600, 900)
    expect(sync()).toBe(true)
    expect(f.registry.onCanvasResize).toHaveBeenCalledTimes(4)
  })

  it('sets the portal backing buffer before registration and changes it only with real geometry', () => {
    const f = fixture()
    f.child.devicePixelRatio = 2
    const geometry = vi
      .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 640.5, 360.9))
    const registeredSizes: number[][] = []
    f.registry.registerVideoCanvas.mockImplementation((canvas: HTMLCanvasElement) => {
      registeredSizes.push([canvas.width, canvas.height])
    })
    expect(prepare()).toBe(true)
    expect(registeredSizes).toEqual([
      [1281, 721],
      [1281, 721]
    ])
    const remote = f.doc.querySelector('canvas')!
    const setWidth = vi.spyOn(remote, 'width', 'set')
    const setHeight = vi.spyOn(remote, 'height', 'set')
    expect(sync()).toBe(true)
    expect(sync()).toBe(true)
    expect(setWidth).not.toHaveBeenCalled()
    expect(setHeight).not.toHaveBeenCalled()
    geometry.mockReturnValue(new DOMRect(0, 0, 800.5, 450.9))
    expect(sync()).toBe(true)
    expect([remote.width, remote.height]).toEqual([1601, 901])
    expect(setWidth).toHaveBeenCalledExactlyOnceWith(1601)
    expect(setHeight).toHaveBeenCalledExactlyOnceWith(901)
    expect(sync()).toBe(true)
    expect(setWidth).toHaveBeenCalledOnce()
    expect(setHeight).toHaveBeenCalledOnce()
  })

  it('uses the main supplied viewport for initial buffers when detached layout is still empty', () => {
    const f = fixture()
    expect(prepare()).toBe(true)
    const [remote, self] = Array.from(f.doc.querySelectorAll('canvas'))
    expect([remote!.width, remote!.height]).toEqual([960, 540])
    expect([self!.width, self!.height]).toEqual([240, 151])
  })

  it('masks unrendered and muted video instead of displaying a stale last frame', () => {
    const f = fixture()
    expect(prepare()).toBe(true)
    expect(sync()).toBe(true)
    const [remote, self] = Array.from(f.doc.querySelectorAll('canvas'))
    expect(remote!.style.visibility).toBe('hidden')
    f.setRendered(true)
    expect(sync()).toBe(true)
    expect(remote!.style.visibility).toBe('visible')
    expect(self!.style.visibility).toBe('visible')
    f.call.peerVideoState = 'off'
    f.call.selfVideoState = 'off'
    expect(sync()).toBe(true)
    expect(remote!.style.visibility).toBe('hidden')
    expect(self!.style.visibility).toBe('hidden')
    expect(f.doc.body.textContent).toContain('Your camera is off')
  })

  it('fails without opening anything when the registry is not ready', () => {
    const f = fixture()
    f.registry.getRendererType = () => {
      throw new Error('Not ready')
    }
    expect(prepare()).toBe(false)
    expect(f.open).not.toHaveBeenCalled()
  })

  it('cleans partial registrations after a renderer error', () => {
    const f = fixture()
    f.registry.registerVideoCanvas.mockImplementationOnce(() => {
      throw new Error('Failure')
    })
    expect(prepare()).toBe(false)
    expect(f.child.closed).toBe(true)
    expect(f.registry.unregisterVideoCanvas).toHaveBeenCalledTimes(2)
  })
})
