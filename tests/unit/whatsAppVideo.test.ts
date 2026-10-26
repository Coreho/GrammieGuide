// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { whatsAppVideoRuntime } from '../../src/shared/whatsAppVideo'

afterEach(() => {
  whatsAppVideoRuntime({ type: 'close', name: 'owned-video' })
  vi.unstubAllGlobals()
})

function fixture(): {
  doc: Document
  child: { closed: boolean; close: ReturnType<typeof vi.fn> }
  registry: {
    getRendererType: () => number
    registerVideoCanvas: ReturnType<typeof vi.fn>
    unregisterVideoCanvas: ReturnType<typeof vi.fn>
    assignSourceToCanvas: ReturnType<typeof vi.fn>
    onCanvasResize: ReturnType<typeof vi.fn>
    setCoverFit: ReturnType<typeof vi.fn>
    hasRenderedFirstFrameForCanvas: () => boolean
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
  const registry = {
    getRendererType: () => 1,
    registerVideoCanvas: vi.fn(),
    unregisterVideoCanvas: vi.fn(),
    assignSourceToCanvas: vi.fn(),
    onCanvasResize: vi.fn(),
    setCoverFit: vi.fn(),
    hasRenderedFirstFrameForCanvas: () => rendered
  }
  const self = {}
  const peers = new Map<unknown, object>()
  const source = {
    self: vi.fn(() => self),
    peer: vi.fn((peer: unknown) => {
      if (!peers.has(peer)) peers.set(peer, {})
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
    }
  }
}

const prepare = (): boolean => whatsAppVideoRuntime({ type: 'prepare', name: 'owned-video' })
const sync = (): boolean =>
  whatsAppVideoRuntime({ type: 'sync', name: 'owned-video', callId: 'provider-call' })

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
  })

  it('binds camera sources once and rebinds only a changed video identity', () => {
    const f = fixture()
    expect(prepare()).toBe(true)
    expect(whatsAppVideoRuntime({ type: 'sync', name: 'owned-video', callId: 'stale' })).toBe(false)
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
