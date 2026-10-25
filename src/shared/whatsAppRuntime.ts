export type WhatsAppRuntimeRequest =
  | { type: 'read' }
  | { type: 'start'; phone: string; mode: 'voice' | 'video' }
  | { type: 'answer' | 'decline' | 'end'; callId: string }
export interface WhatsAppRuntimeState {
  supported: boolean
  idle: boolean
  rejected?: boolean
  /** Fixed diagnostic codes only; never provider messages, peer IDs or numbers. */
  failure?:
    | 'modules'
    | 'gates'
    | 'observation'
    | 'start'
    | 'answer'
    | 'decline'
    | 'end'
    | 'provider-rejected'
    | 'microphone-denied'
    | 'microphone-unavailable'
    | 'recipient-lookup'
    | 'recipient-not-found'
    | 'recipient-unresolved'
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
  let stage: NonNullable<WhatsAppRuntimeState['failure']> = 'modules'
  try {
    const gates = load('WAWebVoipGatingUtils')
    const stack = object(invoke(load('WAWebVoipStackInterface'), 'getCachedVoipStackInterface'))
    const raw = load('WAWebCallCollection')
    const calls = object(raw.default ?? raw)
    const states = object(load('WAWebVoipWaCallEnums').CallState)
    stage = 'gates'
    if (
      stack.type !== 'web' ||
      invoke(gates, 'isCallingEnabled') !== true ||
      invoke(gates, 'isWebCallingUiEnabled') !== true ||
      invoke(gates, 'isUnsupportedBrowserForWebCalling') !== false
    )
      return { ...unavailable(), failure: stage }
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
    stage = 'observation'
    const before = observe()
    if (request.type === 'read' || !before.supported) return before
    if (request.type === 'start') {
      // Video remains disabled until an in-app video rendering path is verified.
      if (request.mode !== 'voice' || !/^\+[1-9]\d{7,14}$/.test(request.phone) || !before.idle)
        throw new Error('Cannot start')
      // Device sync does not resolve every saved PN. The interactive number
      // lookup stores WhatsApp's PN/LID mapping without creating/sending a chat.
      stage = 'recipient-lookup'
      const resolved = await invoke(load('WAWebQueryExistsJob'), 'queryPhoneExists', request.phone)
      if (!resolved) return { ...before, rejected: true, failure: 'recipient-not-found' }
      const peer = invoke(load('WAWebLidMigrationUtils'), 'toLid', object(resolved).wid)
      if (!peer) return { ...before, rejected: true, failure: 'recipient-unresolved' }
      stage = 'start'
      const accepted = await invoke(start, 'startWAWebVoipCall', peer, false, 0, 0, null, {
        entryTrust: 'user_gesture'
      })
      stage = 'observation'
      return {
        ...observe(),
        ...(accepted === true ? {} : { rejected: true, failure: 'provider-rejected' as const })
      }
    }
    if (!before.call || before.call.id !== request.callId) throw new Error('Stale call')
    if (request.type === 'answer') {
      stage = 'answer'
      if (before.call.phase !== 'incoming' || before.call.mode !== 'voice')
        throw new Error('Cannot answer')
      await invoke(stack, 'acceptCall', true, false, null)
    } else if (request.type === 'decline') {
      stage = 'decline'
      if (before.call.phase !== 'incoming') throw new Error('Cannot decline')
      await invoke(stack, 'rejectCall')
    } else {
      stage = 'end'
      const reason = object(load('WAWebVoipSignalingEnums').EndCallReason).Self
      if (typeof reason !== 'number') throw new Error('Unsupported reason')
      await invoke(stack, 'endCall', reason, true)
    }
    return observe()
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : null
    return {
      ...unavailable(),
      failure:
        name === 'NotAllowedError'
          ? 'microphone-denied'
          : name === 'NotFoundError'
            ? 'microphone-unavailable'
            : stage
    }
  }
}
