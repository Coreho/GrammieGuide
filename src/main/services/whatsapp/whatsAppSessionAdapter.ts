import { z } from 'zod'
import type { EmbeddedWhatsAppSession } from './whatsAppSession'
import type { ProviderCallState, WhatsAppAdapter } from './whatsAppAdapter'
import { logActivity } from '../activityLog/activityLog'

const observation = z
  .object({
    supported: z.boolean(),
    videoSupported: z.boolean().optional(),
    idle: z.boolean(),
    rejected: z.boolean().optional(),
    failure: z
      .enum([
        'modules',
        'gates',
        'observation',
        'start',
        'answer',
        'decline',
        'end',
        'provider-rejected',
        'microphone-denied',
        'microphone-unavailable',
        'recipient-lookup',
        'recipient-not-found',
        'recipient-unresolved',
        'offline',
        'video-unavailable'
      ])
      .optional(),
    call: z
      .object({
        id: z.string().min(1).max(256),
        phone: z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/)
          .nullable(),
        mode: z.enum(['voice', 'video']),
        phase: z.enum(['outgoing', 'incoming', 'connecting', 'connected', 'ending'])
      })
      .strict()
      .nullable()
  })
  .strict()
  .refine((s) => !s.supported || s.idle === (s.call === null))
const disabled = { voice: false, video: false, answer: false, decline: false, end: false }

/** Original bridge to observed Web modules. Private API changes fail closed. */
export function createWhatsAppSessionAdapter(setup: EmbeddedWhatsAppSession): WhatsAppAdapter {
  let revision = 0
  let busy = false
  let hadCall = false
  let observedGeneration: number | undefined
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  let timer: ReturnType<typeof setInterval> | undefined
  let stopSetup: (() => void) | undefined
  const unavailable = (): ProviderCallState => ({
    revision: ++revision,
    connection: setup.state().phase === 'link-required' ? 'not-linked' : 'unavailable',
    localSessionClosed: setup.locallyClosed === true,
    capabilities: disabled,
    call: null
  })
  const run = async (
    request: Parameters<EmbeddedWhatsAppSession['run']>[0],
    signal: AbortSignal
  ): Promise<ProviderCallState> => {
    signal.throwIfAborted()
    if (!setup.callsOpen) return unavailable()
    const generation = setup.generationId
    if (generation !== observedGeneration) {
      observedGeneration = generation
      hadCall = false
    }
    busy = true
    const report = (reason: string): void => {
      if (request.type === 'read') return
      // Only fixed, locally selected codes reach logs. Never log provider errors.
      logActivity('whatsapp-control-failed', `${request.type}:${reason}`)
      console.warn('WhatsApp control failed:', request.type, reason)
    }
    // Cancelling JS cannot cancel provider work already submitted. Destroy its
    // renderer so a late promise cannot keep a microphone/call alive invisibly.
    const cancel = (): void => {
      if (signal.aborted) report('cancelled-or-timeout')
      if (setup.generationId === generation) setup.close()
      queueMicrotask(notify)
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      if (request.type === 'start' || request.type === 'answer') {
        let video = request.type === 'start' && request.mode === 'video'
        if (request.type === 'answer') {
          // An incoming call can disappear/change while the trusted command is
          // queued. Establish its exact identity before granting either device.
          const before = observation.parse(await setup.run({ type: 'read' }, signal))
          if (
            !before.supported ||
            before.call?.id !== request.callId ||
            before.call.phase !== 'incoming'
          )
            throw new Error('Incoming call changed')
          video = before.call.mode === 'video'
          if (video && !before.videoSupported) throw new Error('Video unavailable')
        }
        if (video && !(await setup.prepareVideo())) {
          report('video-unavailable')
          cancel()
          return unavailable()
        }
        signal.throwIfAborted()
        if (setup.generationId !== generation) throw new Error('Call session replaced')
        setup.allowCamera(video)
        setup.allowMicrophone(true)
      }
      let state = observation.parse(await setup.run(request, signal))
      // Submission is not a call. Wait briefly for a real model without ever
      // resubmitting Start; otherwise tear down even a late provider operation.
      if (request.type === 'start') {
        const until = Date.now() + 2000
        // The worker can acknowledge Start before the model/state callback lands.
        // An uninspectable transitional snapshot is not proof that Start failed.
        while (!state.call && !state.rejected && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 150))
          signal.throwIfAborted()
          state = observation.parse(await setup.run({ type: 'read' }, signal))
        }
        if (!state.call) {
          report(state.failure ?? 'no-active-model')
          cancel()
          return unavailable()
        }
      }
      if (!state.supported || state.rejected) {
        report(state.failure ?? 'unsupported-observation')
        if (state.failure === 'offline' && request.type === 'read') {
          setup.allowMicrophone(false)
          setup.allowCamera(false)
          // Offline is reported only after positively observed local idle. If a
          // call just ended, destroy its peer so main can clear the old call even
          // while signaling is down; the listener manager may create a fresh one.
          if (hadCall) {
            hadCall = false
            cancel()
          }
          return { ...unavailable(), connection: 'disconnected' }
        }
        if (request.type !== 'read' || hadCall) cancel()
        return unavailable()
      }
      hadCall = !!state.call
      if (state.idle) {
        setup.allowMicrophone(false)
        setup.allowCamera(false)
      }
      return {
        revision: ++revision,
        connection: 'ready',
        capabilities: {
          voice: true,
          video: state.videoSupported === true,
          answer: true,
          decline: true,
          end: true
        },
        call: state.call
      }
    } catch {
      report('bridge-or-validation')
      cancel()
      return unavailable()
    } finally {
      busy = false
      signal.removeEventListener('abort', cancel)
    }
  }
  return {
    location: 'embedded',
    read: (signal) => run({ type: 'read' }, signal),
    execute: (command, signal) => run(command, signal),
    subscribe: (listener) => {
      listeners.add(listener)
      if (!timer) {
        stopSetup = setup.subscribe(notify)
        timer = setInterval(() => {
          if (setup.callsOpen && !busy) notify()
        }, 1000)
        timer.unref()
      }
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          clearInterval(timer)
          timer = undefined
          stopSetup?.()
          stopSetup = undefined
        }
      }
    }
  }
}
