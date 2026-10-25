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
