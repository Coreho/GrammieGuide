import type { ContactPurpose } from '@shared/contacts'
import type { ContactAttempt, ContactChannel, ContactReply } from './types'

export interface TwilioContactConfig {
  accountSid: string
  apiKeySid: string
  apiKeySecret: string
  sender: string
  messagingServiceSid?: string
}
const ORIGIN = 'https://api.twilio.com'
const phone = /^\+[1-9]\d{7,14}$/
const messageId = /^SM[0-9a-fA-F]{32}$/
const unavailable = (): Error => new Error('Contact channel unavailable')

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable()
  return value as Record<string, unknown>
}

/** Direct REST avoids SDK retry defaults: a lost POST response must never trigger another SMS. */
export class TwilioContactChannel implements ContactChannel {
  constructor(
    private readonly getConfig: () => TwilioContactConfig | null,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  private config(): TwilioContactConfig {
    const config = this.getConfig()
    if (
      !config ||
      !/^AC[0-9a-fA-F]{32}$/.test(config.accountSid) ||
      !/^SK[0-9a-fA-F]{32}$/.test(config.apiKeySid) ||
      !config.apiKeySecret ||
      !phone.test(config.sender) ||
      (config.messagingServiceSid && !/^MG[0-9a-fA-F]{32}$/.test(config.messagingServiceSid))
    ) {
      throw unavailable()
    }
    return config
  }

  private path(config: TwilioContactConfig): string {
    return `/2010-04-01/Accounts/${config.accountSid}/Messages`
  }

  private async request(
    config: TwilioContactConfig,
    path: string,
    signal: AbortSignal,
    body?: URLSearchParams
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetcher(`${ORIGIN}${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal,
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString('base64')}`,
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
        },
        ...(body ? { body: body.toString() } : {})
      })
      if (!response.ok || !response.body) {
        await response.body?.cancel()
        throw unavailable()
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > 1_000_000) throw unavailable()
          chunks.push(chunk.value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
      return record(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch {
      // Neither fetch errors nor Twilio error bodies are safe to forward or log.
      throw unavailable()
    }
  }

  async submit(
    attempt: ContactAttempt,
    purpose: ContactPurpose
  ): Promise<{ sid: string; sender?: string }> {
    const config = this.config()
    if (!phone.test(attempt.phone)) throw unavailable()
    const body = new URLSearchParams({
      To: attempt.phone,
      Body:
        purpose === 'test'
          ? 'TEST from GrammieGuide. This is a caregiver check, not a request for help. Reply YES to confirm you saw this test.'
          : 'Grammie asked you to call her. Reply YES to confirm you saw this request.'
    })
    if (config.messagingServiceSid) body.set('MessagingServiceSid', config.messagingServiceSid)
    else body.set('From', config.sender)
    const result = await this.request(
      config,
      `${this.path(config)}.json`,
      AbortSignal.timeout(10_000),
      body
    )
    if (typeof result.sid !== 'string' || !messageId.test(result.sid)) throw unavailable()
    // A Messaging Service may not have selected its sender yet. Poll by SID to
    // learn the real sender before accepting any inbound acknowledgement.
    const sender =
      typeof result.from === 'string' && phone.test(result.from) ? result.from : undefined
    return { sid: result.sid, ...(sender ? { sender } : {}) }
  }

  async delivery(
    sid: string
  ): Promise<{ status: 'pending' | 'delivered' | 'failed'; sender?: string }> {
    const config = this.config()
    if (!messageId.test(sid)) throw unavailable()
    const result = await this.request(
      config,
      `${this.path(config)}/${sid}.json`,
      AbortSignal.timeout(10_000)
    )
    if (result.sid !== sid) throw unavailable()
    const status =
      result.status === 'delivered'
        ? 'delivered'
        : ['failed', 'undelivered', 'canceled'].includes(String(result.status))
          ? 'failed'
          : 'pending'
    const sender =
      typeof result.from === 'string' && phone.test(result.from) ? result.from : undefined
    return { status, ...(sender ? { sender } : {}) }
  }

  async replies(attempt: ContactAttempt): Promise<ContactReply[]> {
    const config = this.config()
    if (!attempt.sender || !phone.test(attempt.sender) || !phone.test(attempt.phone)) return []
    const query = new URLSearchParams({
      From: attempt.phone,
      To: attempt.sender,
      PageSize: '100',
      // DateSent is a day-level filter. Include the preceding UTC day, then
      // use exact provider timestamps in the lifecycle to reject stale replies.
      'DateSent>': new Date(attempt.startedAt - 86_400_000).toISOString().slice(0, 10)
    })
    const path = `${this.path(config)}.json`
    let next = `${path}?${query}`
    const signal = AbortSignal.timeout(10_000)
    const replies: ContactReply[] = []
    for (let page = 0; page < 5; page++) {
      const data = await this.request(config, next, signal)
      if (!Array.isArray(data.messages)) throw unavailable()
      for (const value of data.messages) {
        const message = record(value)
        if (
          message.direction !== 'inbound' ||
          typeof message.sid !== 'string' ||
          !messageId.test(message.sid) ||
          typeof message.from !== 'string' ||
          typeof message.to !== 'string' ||
          typeof message.body !== 'string' ||
          typeof message.date_created !== 'string'
        )
          continue
        const receivedAt = Date.parse(message.date_created)
        if (!Number.isFinite(receivedAt)) continue
        replies.push({
          sid: message.sid,
          from: message.from,
          to: message.to,
          receivedAt,
          body: message.body
        })
      }
      if (data.next_page_uri === null) return replies
      // Treat incomplete/malformed pages as unavailable, never as proof there
      // is no reply. Do not follow arbitrary URLs with an Authorization header.
      if (typeof data.next_page_uri !== 'string' || !data.next_page_uri.startsWith(`${path}?`))
        throw unavailable()
      next = data.next_page_uri
    }
    throw unavailable()
  }
}
