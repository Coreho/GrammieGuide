import {
  contactSetupSchema,
  contactCredentialsSchema,
  type ContactConfig,
  type AdminContactSetup
} from '@shared/contactSettings'
import { testSettled, type ContactTestState, type HomeContactState } from '@shared/contacts'
import type { ContactRequests } from './contactRequests'

/** Long enough for someone to notice a text and reply YES; short enough to try again soon. */
export const TEST_EXPIRES_MS = 5 * 60_000
/** After this, a test text with no delivery report reads as unconfirmed. */
export const TEST_UNCONFIRMED_MS = 2 * 60_000

/** Derives every destination from saved settings. Home never supplies a phone or a URL. */
export class ContactController {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly requests: ContactRequests,
    private readonly config: () => ContactConfig,
    private readonly save: (settings: ContactConfig) => void,
    private readonly photo: (id: string | undefined) => Promise<string | undefined>,
    private readonly now: () => number = Date.now
  ) {}

  private run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work)
    this.queue = result.catch(() => undefined)
    return result
  }

  settings(): Omit<AdminContactSetup, 'smsCallbacks'> {
    const { credentials, ...settings } = this.config()
    return { ...settings, hasCredentials: Boolean(credentials) }
  }

  private async requireNoActiveRequest(): Promise<void> {
    const requests = await this.requests.list()
    // A test carries its own copy of the person it texted, so only her real
    // request needs the settings held still.
    if (requests.some((r) => r.purpose === 'real' && r.expiresAt > this.now())) {
      throw new Error('A callback request is active. Contact settings can change after it expires.')
    }
  }

  saveSettings(value: unknown): Promise<Omit<AdminContactSetup, 'smsCallbacks'>> {
    return this.run(async () => {
      const parsed = contactSetupSchema.safeParse(value)
      if (!parsed.success)
        throw new Error('Check the names, international phone numbers, and request times.')
      await this.requireNoActiveRequest()
      try {
        this.save({ ...parsed.data, credentials: this.config().credentials })
      } catch {
        throw new Error('Contact settings could not be saved. Reopen Contacts to check them.')
      }
      return this.settings()
    })
  }

  setCredentials(value: unknown): Promise<void> {
    return this.run(async () => {
      const parsed = value === null ? null : contactCredentialsSchema.safeParse(value)
      if (parsed && !parsed.success)
        throw new Error(
          'Check the Twilio account, API key, sender, and optional messaging service.'
        )
      await this.requireNoActiveRequest()
      try {
        this.save({ ...this.config(), credentials: parsed?.data })
      } catch {
        throw new Error('SMS settings could not be saved. Reopen Contacts to check them.')
      }
    })
  }

  async home(): Promise<HomeContactState> {
    const config = this.config()
    if (!config.enabled || !config.people[0]) return { contact: null, request: null }
    const photo = async (id?: string): Promise<string | undefined> =>
      this.photo(id).catch(() => undefined)
    let contact: HomeContactState['contact'] = {
      id: config.people[0].id,
      name: config.people[0].name,
      photoUrl: await photo(config.people[0].photoId)
    }
    try {
      const latest =
        (await this.requests.list()).filter((request) => request.purpose === 'real').at(-1) ?? null
      if (latest) {
        for (const attempt of latest.attempts) attempt.photoUrl = await photo(attempt.photoId)
        if (latest.expiresAt > this.now()) {
          const preferred = latest.attempts[0]!
          contact = {
            id: preferred.contactId,
            name: preferred.name ?? 'family',
            photoUrl: preferred.photoUrl
          }
        }
      }
      return { contact, request: latest }
    } catch {
      return { contact, request: null, problem: 'unavailable' }
    }
  }

  /** The latest test only. Reading it never sends or resends anything. */
  async testState(problem?: ContactTestState['problem']): Promise<ContactTestState> {
    const config = this.config()
    const base = {
      people: config.people.slice(0, 2).map(({ id, name }) => ({ id, name })),
      hasCredentials: Boolean(config.credentials),
      checkedAt: this.now()
    }
    try {
      const test =
        (await this.requests.list()).filter((request) => request.purpose === 'test').at(-1) ?? null
      return { ...base, test, ...(problem ? { problem } : {}) }
    } catch {
      return { ...base, test: null, problem: 'unavailable' }
    }
  }

  /** One marked test text to one saved person. The panel supplies an ID, never a number. */
  startTest(contactId: unknown): Promise<ContactTestState> {
    return this.run(async () => {
      const config = this.config()
      const person = config.people.slice(0, 2).find((item) => item.id === contactId)
      if (!person || !config.credentials) return this.testState('not-configured')
      const now = this.now()
      let open
      try {
        open = (await this.requests.list()).filter((request) => request.expiresAt > now)
      } catch {
        return this.testState('unavailable')
      }
      // Her request comes first: no test text goes out while family may be answering her.
      if (open.some((request) => request.purpose === 'real'))
        return this.testState('help-request-active')
      if (open.some((request) => request.purpose === 'test' && !testSettled(request)))
        return this.testState('test-active')
      try {
        await this.requests.request({
          purpose: 'test',
          contacts: [person],
          expiresAfterMs: TEST_EXPIRES_MS,
          fallbackAfterMs: TEST_UNCONFIRMED_MS
        })
      } catch {
        return this.testState('unavailable')
      }
      return this.testState()
    })
  }

  request(): Promise<HomeContactState> {
    return this.run(async () => {
      const config = this.config()
      if (!config.enabled || !config.people[0])
        return { contact: null, request: null, problem: 'not-configured' }
      const before = await this.home()
      if (before.problem) return before
      if (before.request && before.request.expiresAt > this.now()) return before
      if (!config.credentials) return { ...before, problem: 'not-configured' }
      try {
        await this.requests.request({
          purpose: 'real',
          contacts: config.people.slice(0, 2),
          expiresAfterMs: config.expiryMinutes * 60_000,
          fallbackAfterMs: config.fallbackAfterMinutes * 60_000
        })
        return await this.home()
      } catch {
        return { ...before, problem: 'unavailable' }
      }
    })
  }
}
