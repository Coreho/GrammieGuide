import { randomUUID } from 'node:crypto'
import type { ContactPerson } from '@shared/contactSettings'
import {
  whatsAppCommandSchema,
  type WhatsAppAction,
  type WhatsAppCallState,
  type WhatsAppCommandResult,
  type WhatsAppContact
} from '@shared/whatsAppCalls'
import {
  providerCallStateSchema,
  type ProviderCallCommand,
  type WhatsAppAdapter
} from './whatsAppAdapter'

const displayContact = ({ id, name, photoId }: ContactPerson): WhatsAppContact => ({
  id,
  name,
  photoId
})

/** Serializes intent and redacts observations. It never guesses a connected or ended state. */
export class WhatsAppController {
  private queue: Promise<unknown> = Promise.resolve()
  private current: WhatsAppCallState = {
    connection: 'unavailable',
    contacts: [],
    call: null,
    pending: null,
    availableActions: []
  }
  private capabilities = { voice: false, video: false, answer: false, decline: false, end: false }
  private revision = -1
  private providerId: string | null = null
  private providerPhone: string | null = null
  private disposed = false
  private epoch = 0
  private activeAbort: AbortController | null = null
  private readonly unsubscribe: () => void

  constructor(
    private readonly adapter: WhatsAppAdapter,
    private readonly contacts: () => ContactPerson[],
    private readonly onChange: (state: WhatsAppCallState) => void = () => {},
    private readonly timeoutMs = 10_000
  ) {
    this.unsubscribe =
      adapter.location === 'embedded'
        ? adapter.subscribe(() => {
            void this.refresh()
          })
        : () => {}
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work)
    this.queue = result.catch(() => undefined)
    return result
  }

  state(): WhatsAppCallState {
    const state = structuredClone(this.current)
    state.contacts = this.contacts().map(displayContact)
    state.availableActions = []
    if (this.disposed || state.connection !== 'ready' || state.pending) return state
    if (!state.call) {
      if (state.contacts.length) {
        if (this.capabilities.voice) state.availableActions.push('voice')
        if (this.capabilities.video) state.availableActions.push('video')
      }
    } else if (this.providerId) {
      if (state.call.phase === 'incoming') {
        if (
          state.call.contact &&
          this.contacts().some((person) => person.phone === this.providerPhone) &&
          this.capabilities.answer &&
          state.call.mode === 'voice'
        )
          state.availableActions.push('answer')
        if (this.capabilities.decline) state.availableActions.push('decline')
      } else if (this.capabilities.end && state.call.phase !== 'ending')
        state.availableActions.push('end')
    }
    return state
  }

  private publish(): void {
    if (this.disposed) return
    try {
      this.onChange(this.state())
    } catch {
      /* Window recovery must not retry a call. */
    }
  }

  private observe(value: unknown): boolean {
    const parsed = providerCallStateSchema.safeParse(value)
    if (!parsed.success) throw new Error('Invalid observation')
    const snapshot = parsed.data
    if (snapshot.revision <= this.revision) return false
    this.revision = snapshot.revision
    this.capabilities = snapshot.capabilities
    this.current.connection = snapshot.connection
    // A disconnected transport cannot establish that an active call ended.
    if (snapshot.connection !== 'ready') {
      if (snapshot.localSessionClosed) {
        this.current.call = null
        this.providerId = null
        this.providerPhone = null
      } else if (this.current.call) this.current.call.phase = 'unknown'
      return true
    }
    if (snapshot.call) {
      const contact = this.contacts().find((person) => person.phone === snapshot.call!.phone)
      this.current.call = {
        id:
          this.providerId === snapshot.call.id && this.current.call
            ? this.current.call.id
            : randomUUID(),
        contact: contact ? displayContact(contact) : null,
        mode: snapshot.call.mode,
        phase: snapshot.call.phase
      }
      this.providerId = snapshot.call.id
      this.providerPhone = snapshot.call.phone
    } else {
      this.current.call = null
      this.providerId = null
      this.providerPhone = null
    }
    return true
  }

  private uncertain(): void {
    this.current.connection = this.current.call ? 'disconnected' : 'unavailable'
    if (this.current.call) this.current.call.phase = 'unknown'
  }

  /** Main's local teardown interrupts hung JS without waiting for its timeout. */
  cancelPending(): void {
    ++this.epoch
    this.activeAbort?.abort()
    this.uncertain()
    this.publish()
  }

  private async bounded(work: (signal: AbortSignal) => Promise<unknown>): Promise<unknown> {
    const abort = new AbortController()
    this.activeAbort = abort
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(() => work(abort.signal)),
        new Promise<never>((_resolve, reject) => {
          abort.signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
            once: true
          })
          timer = setTimeout(() => abort.abort(), this.timeoutMs)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
      this.activeAbort = null
    }
  }

  refresh(): Promise<WhatsAppCallState> {
    return this.serial(async () => {
      if (this.disposed || this.adapter.location !== 'embedded') return this.state()
      const epoch = this.epoch
      try {
        const value = await this.bounded((signal) => this.adapter.read(signal))
        if (!this.disposed && epoch === this.epoch) this.observe(value)
      } catch {
        this.uncertain()
      }
      this.publish()
      return this.state()
    })
  }

  command(value: unknown, authorize: () => void = () => {}): Promise<WhatsAppCommandResult> {
    return this.serial(async () => {
      // A caregiver can lock the panel while this command is waiting behind another operation.
      authorize()
      const result = (problem?: WhatsAppCommandResult['problem']): WhatsAppCommandResult => ({
        ok: !problem,
        ...(problem ? { problem } : {}),
        state: this.state()
      })
      const parsed = whatsAppCommandSchema.safeParse(value)
      if (!parsed.success) return result('invalid-command')
      if (
        this.disposed ||
        this.adapter.location !== 'embedded' ||
        this.current.connection !== 'ready'
      )
        return result('unavailable')
      const command = parsed.data
      let outgoing: ProviderCallCommand
      let action: WhatsAppAction
      if (command.type === 'start') {
        if (this.current.call) return result('busy')
        const contact = this.contacts().find((person) => person.id === command.contactId)
        if (!contact) return result('not-allowed')
        outgoing = { type: 'start', phone: contact.phone, mode: command.mode }
        action = command.mode
      } else {
        if (!this.current.call || command.callId !== this.current.call.id || !this.providerId)
          return result('stale-call')
        outgoing = { type: command.type, callId: this.providerId }
        action = command.type
      }
      if (!this.state().availableActions.includes(action)) return result('not-allowed')
      if (command.type === 'start') {
        const contact = this.contacts().find((person) => person.id === command.contactId)!
        this.current.call = {
          id: randomUUID(),
          contact: displayContact(contact),
          mode: command.mode,
          phase: 'starting'
        }
      }
      this.current.pending = command.type
      this.publish()
      let problem: WhatsAppCommandResult['problem']
      const epoch = this.epoch
      try {
        const observation = await this.bounded((signal) => {
          authorize()
          return this.adapter.execute(outgoing, signal)
        })
        if (
          this.disposed ||
          epoch !== this.epoch ||
          !this.observe(observation) ||
          this.current.connection !== 'ready'
        )
          throw new Error('No newer usable observation')
      } catch {
        this.uncertain()
        problem = 'unconfirmed'
      } finally {
        this.current.pending = null
        this.publish()
      }
      return result(problem)
    })
  }

  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    this.activeAbort?.abort()
  }
}
