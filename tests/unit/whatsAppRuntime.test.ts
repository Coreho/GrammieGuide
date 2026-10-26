import { afterEach, describe, expect, it, vi } from 'vitest'
import { whatsAppRuntime } from '../../src/shared/whatsAppRuntime'

afterEach(() => vi.unstubAllGlobals())
function fixture(): {
  modules: Record<string, unknown>
  start: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  calls: { activeCall: unknown }
  setState: (value: number) => void
} {
  let state = 0
  const calls = { activeCall: null as unknown, getModelsArray: () => [] }
  const start = vi.fn(async () => true)
  const end = vi.fn(async () => {
    state = 0
    calls.activeCall = null
  })
  const modules: Record<string, unknown> = {
    WAComms: { isSocketConnected: () => true },
    WAWebVoipGatingUtils: {
      isCallingEnabled: () => true,
      isWebCallingUiEnabled: () => true,
      isUnsupportedBrowserForWebCalling: () => false
    },
    WAWebVoipStackInterface: {
      getCachedVoipStackInterface: () => ({
        type: 'web',
        acceptCall: vi.fn(),
        rejectCall: vi.fn(),
        endCall: end
      })
    },
    WAWebCallCollection: calls,
    WAWebVoipWaCallEnums: {
      CallState: {
        None: 0,
        Calling: 1,
        ReceivedCall: 3,
        AcceptSent: 4,
        CallActive: 6,
        CallActiveElseWhere: 7,
        ReceivedCallWithoutOffer: 8,
        Rejoining: 9,
        ConnectedLonely: 11,
        PreCalling: 12,
        CallStateEnding: 13
      }
    },
    WAWebVoipLocalCallStateStore: { getLocalCallState: () => state },
    WAWebVoipStartCall: { startWAWebVoipCall: start },
    WAWebLidMigrationUtils: { toPn: (peer: unknown) => peer, toLid: (peer: unknown) => peer },
    WAWebQueryExistsJob: { queryPhoneExists: vi.fn(async () => ({ wid: 'resolved-peer@lid' })) },
    WAWebWidFactory: { createWid: (jid: string) => jid },
    WAWebVoipSignalingEnums: { EndCallReason: { Self: 2 } }
  }
  vi.stubGlobal('location', { origin: 'https://web.whatsapp.com' })
  vi.stubGlobal('require', (name: string) => modules[name])
  return {
    modules,
    start,
    end,
    calls,
    setState: (value) => {
      state = value
    }
  }
}

function enableVideo(modules: Record<string, unknown>): void {
  modules.WAWebVoipVideoRendererRegistry = {
    videoRendererRegistry: {
      registerVideoCanvas: vi.fn(),
      assignSourceToCanvas: vi.fn(),
      unregisterVideoCanvas: vi.fn(),
      onCanvasResize: vi.fn(),
      setCoverFit: vi.fn(),
      getRendererType: () => 0
    }
  }
  modules.WAWebVoipVideoRenderSource = {
    WAWebVoipVideoRenderStream: { CAMERA: 'CAMERA' },
    WAWebVoipVideoRenderSource: { self: vi.fn(), peer: vi.fn() }
  }
}

describe('observed WhatsApp web control contracts', () => {
  it('advertises video only when its rendering contracts are available', async () => {
    const f = fixture()
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      supported: true,
      videoSupported: false
    })
    enableVideo(f.modules)
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      supported: true,
      videoSupported: true
    })
    ;(
      f.modules.WAWebVoipVideoRendererRegistry as {
        videoRendererRegistry: { getRendererType: () => number }
      }
    ).videoRendererRegistry.getRendererType = () => {
      throw new Error('Renderer not initialized')
    }
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      supported: true,
      videoSupported: false
    })
  })
  it('uses explicit video flags for start and a matching incoming answer', async () => {
    const f = fixture()
    enableVideo(f.modules)
    await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'video' })
    expect(f.start).toHaveBeenCalledExactlyOnceWith('resolved-peer@lid', true, 0, 0, null, {
      entryTrust: 'user_gesture'
    })
    const accept = vi.fn()
    f.modules.WAWebVoipStackInterface = {
      getCachedVoipStackInterface: () => ({
        type: 'web',
        acceptCall: accept,
        rejectCall: vi.fn(),
        endCall: f.end
      })
    }
    f.setState(3)
    f.calls.activeCall = {
      id: 'incoming-video',
      peerJid: '15551111111@c.us',
      getState: () => 3,
      isVideo: true
    }
    await whatsAppRuntime({ type: 'answer', callId: 'stale' })
    expect(accept).not.toHaveBeenCalled()
    await whatsAppRuntime({ type: 'answer', callId: 'incoming-video' })
    expect(accept).toHaveBeenCalledExactlyOnceWith(true, true, null)
  })
  it('does not offer idle calling while disconnected, but preserves an observed active media call', async () => {
    const f = fixture()
    f.modules.WAComms = { isSocketConnected: () => false }
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      supported: false,
      failure: 'offline'
    })
    await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'voice' })
    expect(f.start).not.toHaveBeenCalled()
    f.setState(6)
    f.calls.activeCall = {
      id: 'active',
      peerJid: '15551111111@c.us',
      getState: () => 6,
      isVideo: false
    }
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      supported: true,
      call: { phase: 'connected' }
    })
  })
  it('does not call a number that WhatsApp cannot resolve', async () => {
    const f = fixture()
    const query = vi.fn(async () => null)
    f.modules.WAWebQueryExistsJob = { queryPhoneExists: query }
    expect(
      await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'voice' })
    ).toMatchObject({ rejected: true, failure: 'recipient-not-found', call: null })
    expect(query).toHaveBeenCalledExactlyOnceWith('+15551111111')
    expect(f.start).not.toHaveBeenCalled()
  })
  it('does not guess a calling identity when lookup has no LID mapping', async () => {
    const f = fixture()
    f.modules.WAWebLidMigrationUtils = { toLid: () => null }
    expect(
      await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'voice' })
    ).toMatchObject({ rejected: true, failure: 'recipient-unresolved' })
    expect(f.start).not.toHaveBeenCalled()
  })
  it('reports the failing stage without returning provider errors or private identifiers', async () => {
    const f = fixture()
    f.start.mockRejectedValue(new Error('private-peer: +15551111111 provider details'))
    const result = await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'voice' })
    expect(result).toMatchObject({ supported: false, failure: 'start', call: null })
    expect(JSON.stringify(result)).not.toContain('15551111111')
    expect(JSON.stringify(result)).not.toContain('private-peer')
  })
  it('reports positively observed idle and invokes the high-level voice entry only on a command', async () => {
    const f = fixture()
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      supported: true,
      idle: true,
      call: null
    })
    expect(f.start).not.toHaveBeenCalled()
    await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'voice' })
    expect(f.start).toHaveBeenCalledWith('resolved-peer@lid', false, 0, 0, null, {
      entryTrust: 'user_gesture'
    })
  })
  it('maps an actual model and never treats a missing model in an active state as idle', async () => {
    const f = fixture()
    f.setState(6)
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({ supported: false, idle: false })
    f.calls.activeCall = {
      id: 'provider-call',
      peerJid: '15551111111@c.us',
      getState: () => 6,
      isVideo: false
    }
    expect(await whatsAppRuntime({ type: 'read' })).toMatchObject({
      idle: false,
      call: { phase: 'connected', phone: '+15551111111' }
    })
    await whatsAppRuntime({ type: 'end', callId: 'stale' })
    expect(f.end).not.toHaveBeenCalled()
    expect(await whatsAppRuntime({ type: 'end', callId: 'provider-call' })).toMatchObject({
      idle: true,
      call: null
    })
    expect(f.end).toHaveBeenCalledWith(2, true)
  })
  it('fails closed for a different origin, missing methods and video', async () => {
    const f = fixture()
    await whatsAppRuntime({ type: 'start', phone: '+15551111111', mode: 'video' })
    expect(f.start).not.toHaveBeenCalled()
    vi.stubGlobal('location', { origin: 'https://evil.test' })
    expect((await whatsAppRuntime({ type: 'read' })).supported).toBe(false)
  })
})
