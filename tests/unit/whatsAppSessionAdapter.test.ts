import { describe, expect, it, vi } from 'vitest'
import { createWhatsAppSessionAdapter } from '../../src/main/services/whatsapp/whatsAppSessionAdapter'
import type { EmbeddedWhatsAppSession } from '../../src/main/services/whatsapp/whatsAppSession'

function fixture(): {
  session: {
    callsOpen: boolean
    locallyClosed: boolean
    generationId: number
    state: () => { open: boolean; phase: string }
    allowMicrophone: ReturnType<typeof vi.fn>
    allowCamera: ReturnType<typeof vi.fn>
    prepareVideo: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    run: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  }
  adapter: ReturnType<typeof createWhatsAppSessionAdapter>
} {
  const session = {
    callsOpen: true,
    locallyClosed: false,
    generationId: 1,
    state: () => ({ open: false, phase: 'linked' }),
    allowMicrophone: vi.fn(),
    allowCamera: vi.fn(),
    prepareVideo: vi.fn(async () => true),
    close: vi.fn(() => {
      ++session.generationId
      session.callsOpen = false
      session.locallyClosed = true
    }),
    run: vi.fn(async () => ({ supported: true, idle: true, call: null }) as unknown),
    subscribe: vi.fn(() => () => {})
  }
  const adapter = createWhatsAppSessionAdapter(session as unknown as EmbeddedWhatsAppSession)
  return { session, adapter }
}

describe('embedded voice transport', () => {
  it('prepares the video surface before leasing a camera and releases capture at idle', async () => {
    const { session, adapter } = fixture()
    const order: string[] = []
    session.prepareVideo.mockImplementation(async () => {
      order.push('prepare')
      return true
    })
    session.allowCamera.mockImplementation((allow) => {
      if (allow) order.push('camera')
    })
    session.run.mockResolvedValue({
      supported: true,
      videoSupported: true,
      idle: false,
      call: { id: 'video', phone: '+15551111111', mode: 'video', phase: 'outgoing' }
    })
    expect(
      await adapter.execute(
        { type: 'start', phone: '+15551111111', mode: 'video' },
        new AbortController().signal
      )
    ).toMatchObject({ capabilities: { video: true }, call: { mode: 'video' } })
    expect(order).toEqual(['prepare', 'camera'])
    expect(session.run).toHaveBeenCalledOnce()
    session.run.mockResolvedValue({ supported: true, videoSupported: true, idle: true, call: null })
    await adapter.read(new AbortController().signal)
    expect(session.allowCamera).toHaveBeenLastCalledWith(false)
    expect(session.allowMicrophone).toHaveBeenLastCalledWith(false)
  })
  it('does not send Start or grant capture when the video surface cannot be prepared', async () => {
    const { session, adapter } = fixture()
    session.prepareVideo.mockResolvedValue(false)
    expect(
      await adapter.execute(
        { type: 'start', phone: '+15551111111', mode: 'video' },
        new AbortController().signal
      )
    ).toMatchObject({ connection: 'unavailable', localSessionClosed: true })
    expect(session.run).not.toHaveBeenCalled()
    expect(session.allowCamera).not.toHaveBeenCalledWith(true)
    expect(session.allowMicrophone).not.toHaveBeenCalledWith(true)
  })
  it('cannot grant capture or submit Start after cancellation during video preparation', async () => {
    const { session, adapter } = fixture()
    let finish!: (value: boolean) => void
    session.prepareVideo.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    const abort = new AbortController()
    const pending = adapter.execute(
      { type: 'start', phone: '+15551111111', mode: 'video' },
      abort.signal
    )
    abort.abort()
    finish(true)
    expect(await pending).toMatchObject({ connection: 'unavailable', localSessionClosed: true })
    expect(session.run).not.toHaveBeenCalled()
    expect(session.allowCamera).not.toHaveBeenCalledWith(true)
    expect(session.allowMicrophone).not.toHaveBeenCalledWith(true)
  })
  it('observes the exact incoming video call before leasing capture for Answer', async () => {
    const { session, adapter } = fixture()
    session.run
      .mockResolvedValueOnce({
        supported: true,
        videoSupported: true,
        idle: false,
        call: { id: 'video', phone: '+15551111111', mode: 'video', phase: 'incoming' }
      })
      .mockResolvedValue({
        supported: true,
        videoSupported: true,
        idle: false,
        call: { id: 'video', phone: '+15551111111', mode: 'video', phase: 'connected' }
      })
    expect(
      await adapter.execute({ type: 'answer', callId: 'video' }, new AbortController().signal)
    ).toMatchObject({ call: { phase: 'connected' } })
    expect(session.prepareVideo).toHaveBeenCalledOnce()
    expect(session.allowCamera).toHaveBeenCalledWith(true)
    expect(session.run.mock.calls.map((args) => args[0].type)).toEqual(['read', 'answer'])
  })
  it('never leases camera or answers after the incoming call has changed', async () => {
    const { session, adapter } = fixture()
    session.run.mockResolvedValue({
      supported: true,
      videoSupported: true,
      idle: false,
      call: { id: 'new-video', phone: '+15551111111', mode: 'video', phase: 'incoming' }
    })
    await adapter.execute({ type: 'answer', callId: 'old-video' }, new AbortController().signal)
    expect(session.run.mock.calls.map((args) => args[0].type)).toEqual(['read'])
    expect(session.allowCamera).not.toHaveBeenCalledWith(true)
    expect(session.prepareVideo).not.toHaveBeenCalled()
  })
  it('clears a locally ended call with destruction proof when signaling is offline', async () => {
    const { session, adapter } = fixture()
    session.run.mockResolvedValue({
      supported: true,
      idle: false,
      call: {
        id: 'ended-later',
        phone: '+15551111111',
        mode: 'voice',
        phase: 'connected'
      }
    })
    await adapter.read(new AbortController().signal)
    session.run.mockResolvedValue({ supported: false, idle: false, call: null, failure: 'offline' })
    expect(await adapter.read(new AbortController().signal)).toMatchObject({
      connection: 'disconnected',
      call: null,
      localSessionClosed: true
    })
    expect(session.close).toHaveBeenCalledOnce()
  })
  it('reports idle offline state without destroying the listener and revokes capture permission', async () => {
    const { session, adapter } = fixture()
    session.run.mockResolvedValue({ supported: false, idle: false, call: null, failure: 'offline' })
    expect(await adapter.read(new AbortController().signal)).toMatchObject({
      connection: 'disconnected'
    })
    expect(session.allowMicrophone).toHaveBeenLastCalledWith(false)
    expect(session.close).not.toHaveBeenCalled()
  })
  it('waits for the worker call model after Start instead of destroying a transitional snapshot', async () => {
    vi.useFakeTimers()
    try {
      const { session, adapter } = fixture()
      session.run
        .mockResolvedValueOnce({ supported: false, idle: false, call: null })
        .mockResolvedValue({
          supported: true,
          idle: false,
          call: {
            id: 'actual-model',
            phone: '+15551111111',
            mode: 'voice',
            phase: 'outgoing'
          }
        })
      const pending = adapter.execute(
        { type: 'start', phone: '+15551111111', mode: 'voice' },
        new AbortController().signal
      )
      await vi.advanceTimersByTimeAsync(150)
      expect(await pending).toMatchObject({ connection: 'ready', call: { phase: 'outgoing' } })
      expect(session.close).not.toHaveBeenCalled()
      expect(session.run.mock.calls.map((args) => args[0].type)).toEqual(['start', 'read'])
    } finally {
      vi.useRealTimers()
    }
  })
  it('allows a fresh idle backend to load after a previous call', async () => {
    const { session, adapter } = fixture()
    session.run.mockResolvedValue({
      supported: true,
      idle: false,
      call: {
        id: 'old-call',
        phone: '+15551111111',
        mode: 'voice',
        phase: 'connected'
      }
    })
    await adapter.read(new AbortController().signal)
    ++session.generationId
    session.run.mockResolvedValue({ supported: false, idle: false, call: null })
    await adapter.read(new AbortController().signal)
    expect(session.close).not.toHaveBeenCalled()
  })
  it('requires an explicit command for microphone access and a real model for calling', async () => {
    const { session, adapter } = fixture()
    const signal = new AbortController().signal
    expect(await adapter.read(signal)).toMatchObject({
      connection: 'ready',
      call: null,
      capabilities: { video: false }
    })
    expect(session.allowMicrophone).not.toHaveBeenCalledWith(true)
    session.run.mockResolvedValue({
      supported: true,
      idle: false,
      call: {
        id: 'provider',
        phone: '+15551111111',
        mode: 'voice',
        phase: 'outgoing'
      }
    })
    expect(
      await adapter.execute({ type: 'start', phone: '+15551111111', mode: 'voice' }, signal)
    ).toMatchObject({ call: { phase: 'outgoing' } })
    expect(session.allowMicrophone).toHaveBeenCalledWith(true)
    session.run.mockResolvedValue({ supported: true, idle: true, call: null })
    await adapter.read(signal)
    expect(session.allowMicrophone).toHaveBeenLastCalledWith(false)
  })
  it('destroys the local session when a submitted action cannot be observed', async () => {
    const { session, adapter } = fixture()
    session.run.mockResolvedValue({ supported: false, idle: false, call: null })
    expect(
      await adapter.execute(
        { type: 'start', phone: '+15551111111', mode: 'voice' },
        new AbortController().signal
      )
    ).toMatchObject({ connection: 'unavailable', localSessionClosed: true })
    expect(session.close).toHaveBeenCalledOnce()
  })
  it('destroys hung provider work on cancellation so it cannot later make a hidden call', async () => {
    const { session, adapter } = fixture()
    let finish!: (value: unknown) => void
    session.run.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const abort = new AbortController()
    const pending = adapter.execute(
      { type: 'start', phone: '+15551111111', mode: 'voice' },
      abort.signal
    )
    abort.abort()
    expect(session.close).toHaveBeenCalled()
    finish({ supported: false, idle: false, call: null })
    expect(await pending).toMatchObject({ localSessionClosed: true })
  })
  it('fails closed for malformed provider data without publishing it', async () => {
    const { session, adapter } = fixture()
    session.run.mockResolvedValue({ supported: true, idle: true, call: { token: 'private' } })
    const state = await adapter.read(new AbortController().signal)
    expect(state).toMatchObject({ connection: 'unavailable', localSessionClosed: true })
    expect(JSON.stringify(state)).not.toContain('private')
  })
})
