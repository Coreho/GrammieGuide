import { randomUUID } from 'node:crypto'
import type { ContactRequestSummary } from '@shared/contacts'
import {
  summarize,
  type ContactChannel,
  type RequestJournal,
  type RequestOptions,
  type RequestStore,
  type SavedRequest
} from './types'

/** One instance owns the journal. Sending and polling share a queue, including disk writes. */
export class ContactRequests {
  private journal?: RequestJournal
  private unavailable = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: RequestStore,
    private readonly channel: ContactChannel,
    private readonly now: () => number = Date.now
  ) {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async save(journal: RequestJournal): Promise<void> {
    try {
      await this.store.save(journal)
      this.journal = structuredClone(journal)
    } catch {
      // A write may have reached disk despite its error. Stop this instance rather
      // than use stale memory to repeat a send; restart re-reads the durable intent.
      this.unavailable = true
      throw new Error('Request history unavailable')
    }
  }

  private async load(): Promise<RequestJournal> {
    if (this.unavailable) throw new Error('Request history unavailable')
    if (!this.journal) {
      try {
        const journal = await this.store.load()
        let changed = false
        for (const request of journal.requests) {
          const previousRequest = JSON.stringify(request)
          for (const attempt of request.attempts) {
            if (attempt.status === 'sending' && !attempt.sid) {
              attempt.status = 'unknown'
              changed = true
            }
          }
          this.refresh(request)
          if (previousRequest !== JSON.stringify(request)) {
            request.updatedAt = this.now()
            changed = true
          }
        }
        if (changed) await this.save(journal)
        else this.journal = journal
      } catch {
        this.unavailable = true
        throw new Error('Request history unavailable')
      }
    }
    return structuredClone(this.journal!)
  }

  private refresh(request: SavedRequest): void {
    request.status = request.attempts.some((a) => a.status === 'answered')
      ? 'answered'
      : this.now() >= request.expiresAt
        ? 'expired'
        : request.attempts.at(-1)!.status
  }

  private async persist(journal: RequestJournal, request: SavedRequest): Promise<void> {
    this.refresh(request)
    request.updatedAt = this.now()
    await this.save(journal)
  }

  private async submit(journal: RequestJournal, request: SavedRequest): Promise<void> {
    const contact = request.contacts[request.attempts.length]!
    const attempt = { ...contact, startedAt: this.now(), status: 'sending' as const }
    request.attempts.push(attempt)
    // Intent must be durable before the external side effect. Twilio does not
    // give us a submission idempotency key to recover a lost POST response.
    await this.persist(journal, request)
    const saved = request.attempts.at(-1)!
    try {
      const result = await this.channel.submit(saved, request.purpose)
      if (!result.sid) throw new Error('Missing message ID')
      saved.sid = result.sid
      saved.sender = result.sender
    } catch {
      saved.status = 'unknown'
    }
    await this.persist(journal, request)
  }

  request(options: RequestOptions): Promise<ContactRequestSummary> {
    return this.run(async () => {
      validateOptions(options)
      const journal = await this.load()
      const active = journal.requests.find(
        (r) => r.purpose === options.purpose && r.expiresAt > this.now()
      )
      // Even answered/failed requests keep their tap guard until expiry. A new
      // request becomes possible at the exact expiry boundary, never via a retry.
      if (active) return summarize(active)
      const phones = new Set(options.contacts.map((c) => c.phone))
      if (
        journal.requests.some(
          (r) => r.expiresAt > this.now() && r.contacts.some((c) => phones.has(c.phone))
        )
      ) {
        throw new Error('A request for this contact is already active')
      }
      // Retain the most recent 1,000 outcomes without eventually disabling the
      // kiosk's contact button. Only expired tap guards may leave the journal.
      while (journal.requests.length >= 1000) {
        const oldest = journal.requests.findIndex((r) => r.expiresAt <= this.now())
        if (oldest < 0) throw new Error('Request history is full')
        journal.requests.splice(oldest, 1)
      }
      const request: SavedRequest = {
        id: randomUUID(),
        purpose: options.purpose,
        status: 'sending',
        createdAt: this.now(),
        updatedAt: this.now(),
        expiresAt: this.now() + options.expiresAfterMs,
        fallbackAfterMs: options.fallbackAfterMs,
        contacts: structuredClone(options.contacts),
        attempts: []
      }
      journal.requests.push(request)
      await this.submit(journal, request)
      return summarize(request)
    })
  }

  poll(): Promise<void> {
    return this.run(async () => {
      const journal = await this.load()
      for (const request of journal.requests) {
        if (this.now() >= request.expiresAt) {
          if (request.status !== 'expired' && request.status !== 'answered')
            await this.persist(journal, request)
          continue
        }
        if (request.status === 'answered') continue
        for (const attempt of request.attempts) {
          if (!attempt.sid || attempt.status === 'answered') continue
          let lastSaved = JSON.stringify(attempt)
          const saveObservation = async (): Promise<void> => {
            const current = JSON.stringify(attempt)
            if (current === lastSaved) return
            await this.persist(journal, request)
            lastSaved = current
          }
          // Failed polls do not undo a confirmed delivery, and do not mean the
          // SMS failed. The deadline below turns unconfirmed delivery into unknown.
          try {
            const report = await this.channel.delivery(attempt.sid)
            if (report.sender) attempt.sender = report.sender
            if (report.status === 'delivered') {
              attempt.deliveredAt ??= this.now()
              attempt.status = 'delivered'
            } else if (report.status === 'failed' && !attempt.deliveredAt) attempt.status = 'failed'
          } catch {
            /* Keep the last confirmed observation. */
          }
          await saveObservation()
          if (attempt.sender) {
            try {
              const used = new Set(
                journal.requests.flatMap((r) => r.attempts.map((a) => a.replySid))
              )
              const replies = await this.channel.replies(attempt)
              const reply = replies
                .filter(
                  (reply) =>
                    reply.sid &&
                    !used.has(reply.sid) &&
                    reply.from === attempt.phone &&
                    reply.to === attempt.sender &&
                    reply.receivedAt > attempt.startedAt &&
                    reply.receivedAt <= this.now() &&
                    reply.receivedAt < request.expiresAt &&
                    reply.body.trim().toUpperCase() === 'YES'
                )
                .sort((a, b) => a.receivedAt - b.receivedAt)[0]
              if (reply) {
                attempt.status = 'answered'
                attempt.answeredAt = reply.receivedAt
                attempt.replySid = reply.sid
              }
            } catch {
              /* An unread reply is not an acknowledgement. */
            }
          }
          await saveObservation()
          if (
            attempt.status === 'sending' &&
            this.now() - attempt.startedAt >= request.fallbackAfterMs
          ) {
            attempt.status = 'unknown'
          }
          await saveObservation()
          if (request.attempts.some((a) => a.status === 'answered')) break
        }
        const latest = request.attempts.at(-1)!
        const due =
          latest.status === 'failed' || this.now() - latest.startedAt >= request.fallbackAfterMs
        if (
          !request.attempts.some((a) => a.status === 'answered') &&
          this.now() < request.expiresAt &&
          due &&
          request.attempts.length < request.contacts.length
        )
          await this.submit(journal, request)
      }
    })
  }

  list(): Promise<ContactRequestSummary[]> {
    return this.run(async () => (await this.load()).requests.map(summarize))
  }
}

function validateOptions(options: RequestOptions): void {
  if (
    !options ||
    !['real', 'test'].includes(options.purpose) ||
    !Array.isArray(options.contacts) ||
    options.contacts.length < 1 ||
    options.contacts.length > 2 ||
    options.contacts.some(
      (c) => !c || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) || !/^\+[1-9]\d{7,14}$/.test(c.phone)
    ) ||
    new Set(options.contacts.map((c) => c.id)).size !== options.contacts.length ||
    new Set(options.contacts.map((c) => c.phone)).size !== options.contacts.length ||
    !Number.isSafeInteger(options.expiresAfterMs) ||
    options.expiresAfterMs < 60_000 ||
    options.expiresAfterMs > 86_400_000 ||
    !Number.isSafeInteger(options.fallbackAfterMs) ||
    options.fallbackAfterMs < 1000 ||
    options.fallbackAfterMs >= options.expiresAfterMs
  ) {
    throw new Error('Invalid contact request settings')
  }
}
