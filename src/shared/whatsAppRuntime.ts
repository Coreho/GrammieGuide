export type WhatsAppRuntimeRequest =
  | { type: 'read' }
  | { type: 'start'; phone: string; mode: 'voice' | 'video' }
  | { type: 'answer' | 'decline' | 'end'; callId: string }
export interface WhatsAppRuntimeState {
  supported: boolean
  idle: boolean
  rejected?: boolean
  call: {
    id: string
    phone: string | null
    mode: 'voice' | 'video'
    phase: 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ending'
  } | null
}

/** Original integration code, serialized into WhatsApp only. No provider source is copied. */
export async function whatsAppRuntime(
  request: WhatsAppRuntimeRequest
): Promise<WhatsAppRuntimeState> {
  type Obj = Record<string, unknown>
  const scope = globalThis as unknown as {
    location: { origin: string }
    require?: (name: string) => unknown
  }
  const unavailable = (): WhatsAppRuntimeState => ({ supported: false, idle: false, call: null })
  if (scope.location?.origin !== 'https://web.whatsapp.com' || typeof scope.require !== 'function')
    return unavailable()
  const object = (value: unknown): Obj => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function'))
      throw new Error('Unsupported module')
    return value as Obj
  }
  const load = (name: string): Obj => object(scope.require!(name))
  const invoke = (target: Obj, name: string, ...args: unknown[]): unknown => {
    const method = target[name]
    if (typeof method !== 'function') throw new Error('Unsupported control')
    return Reflect.apply(method, target, args)
  }
  try {
    const gates = load('WAWebVoipGatingUtils')
    const stack = object(invoke(load('WAWebVoipStackInterface'), 'getCachedVoipStackInterface'))
    const raw = load('WAWebCallCollection')
    const calls = object(raw.default ?? raw)
    const states = object(load('WAWebVoipWaCallEnums').CallState)
    if (
      stack.type !== 'web' ||
      invoke(gates, 'isCallingEnabled') !== true ||
      invoke(gates, 'isWebCallingUiEnabled') !== true ||
      invoke(gates, 'isUnsupportedBrowserForWebCalling') !== false
    )
      return unavailable()
    for (const name of ['acceptCall', 'rejectCall', 'endCall'])
      if (typeof stack[name] !== 'function') return unavailable()
    const start = load('WAWebVoipStartCall')
    if (
      typeof start.startWAWebVoipCall !== 'function' ||
      typeof calls.getModelsArray !== 'function'
    )
      return unavailable()
    const phoneOf = (peer: unknown): string | null => {
      try {
        const pn = invoke(load('WAWebLidMigrationUtils'), 'toPn', peer) ?? peer
        const match = /^(\d{8,15})@(c\.us|s\.whatsapp\.net)$/.exec(String(pn))
        return match ? `+${match[1]}` : null
      } catch {
        return null
      }
    }
    const observe = (): WhatsAppRuntimeState => {
      const local = invoke(load('WAWebVoipLocalCallStateStore'), 'getLocalCallState')
      if (typeof local !== 'number') return unavailable()
      if (
        (local === states.None || local === states.CallActiveElseWhere) &&
        !calls.pendingOutgoingCall
      ) {
        if (!calls.activeCall) return { supported: true, idle: true, call: null }
        const modelState = invoke(object(calls.activeCall), 'getState')
        if (
          modelState === states.None ||
          modelState === states.CallActiveElseWhere ||
          modelState === states.CallStateEnding
        )
          return { supported: true, idle: true, call: null }
        return unavailable()
      }
      if (!calls.activeCall) return unavailable()
      const call = object(calls.activeCall)
      const state = invoke(call, 'getState')
      if (typeof state !== 'number') return unavailable()
      let phase: NonNullable<WhatsAppRuntimeState['call']>['phase']
      if (state === states.CallActive) phase = 'connected'
      else if (state === states.ReceivedCall || state === states.ReceivedCallWithoutOffer)
        phase = 'incoming'
      else if (
        state === states.Calling ||
        state === states.PreacceptReceived ||
        state === states.PreCalling ||
        state === states.CallBCallStarting
      )
        phase = 'outgoing'
      else if (
        state === states.AcceptSent ||
        state === states.AcceptReceived ||
        state === states.Rejoining ||
        state === states.ConnectedLonely
      )
        phase = 'connecting'
      else if (state === states.CallStateEnding) phase = 'ending'
      else return unavailable()
      if (typeof call.id !== 'string' || !call.id || call.id.length > 256) return unavailable()
      return {
        supported: true,
        idle: false,
        call: {
          id: call.id,
          phone: call.isGroup ? null : phoneOf(call.peerJid),
          mode: call.isVideo ? 'video' : 'voice',
          phase
        }
      }
    }
    const before = observe()
    if (request.type === 'read' || !before.supported) return before
    if (request.type === 'start') {
      // Video remains disabled until an in-app video rendering path is verified.
      if (request.mode !== 'voice' || !/^\+[1-9]\d{7,14}$/.test(request.phone) || !before.idle)
        throw new Error('Cannot start')
      const peer = invoke(load('WAWebWidFactory'), 'createWid', `${request.phone.slice(1)}@c.us`)
      const accepted = await invoke(start, 'startWAWebVoipCall', peer, false, 0, 0, null, {
        entryTrust: 'user_gesture'
      })
      return { ...observe(), ...(accepted === true ? {} : { rejected: true }) }
    }
    if (!before.call || before.call.id !== request.callId) throw new Error('Stale call')
    if (request.type === 'answer') {
      if (before.call.phase !== 'incoming' || before.call.mode !== 'voice')
        throw new Error('Cannot answer')
      await invoke(stack, 'acceptCall', true, false, null)
    } else if (request.type === 'decline') {
      if (before.call.phase !== 'incoming') throw new Error('Cannot decline')
      await invoke(stack, 'rejectCall')
    } else {
      const reason = object(load('WAWebVoipSignalingEnums').EndCallReason).Self
      if (typeof reason !== 'number') throw new Error('Unsupported reason')
      await invoke(stack, 'endCall', reason, true)
    }
    return observe()
  } catch {
    return unavailable()
  }
}
