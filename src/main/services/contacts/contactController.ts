import {
  contactSetupSchema,
  contactCredentialsSchema,
  type ContactConfig,
  type AdminContactSetup
} from '@shared/contactSettings'
import type { HomeContactState } from '@shared/contacts'
import type { ContactRequests } from './contactRequests'

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

  settings(): AdminContactSetup {
    const { credentials, ...settings } = this.config()
    return { ...settings, hasCredentials: Boolean(credentials) }
  }

  private async requireNoActiveRequest(): Promise<void> {
    const requests = await this.requests.list()
    if (requests.some((request) => request.expiresAt > this.now())) {
      throw new Error('A callback request is active. Contact settings can change after it expires.')
    }
  }

  saveSettings(value: unknown): Promise<AdminContactSetup> {
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
    if (!config.enabled || !config.preferred) return { contact: null, request: null }
    const photo = async (id?: string): Promise<string | undefined> =>
      this.photo(id).catch(() => undefined)
    let contact: HomeContactState['contact'] = {
      id: config.preferred.id,
      name: config.preferred.name,
      photoUrl: await photo(config.preferred.photoId)
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

  request(): Promise<HomeContactState> {
    return this.run(async () => {
      const config = this.config()
      if (!config.enabled || !config.preferred)
        return { contact: null, request: null, problem: 'not-configured' }
      const before = await this.home()
      if (before.problem) return before
      if (before.request && before.request.expiresAt > this.now()) return before
      if (!config.credentials) return { ...before, problem: 'not-configured' }
      try {
        await this.requests.request({
          purpose: 'real',
          contacts: [config.preferred, ...(config.fallback ? [config.fallback] : [])],
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
