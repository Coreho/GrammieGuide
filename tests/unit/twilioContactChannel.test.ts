import { describe, expect, it, vi } from 'vitest'
import { TwilioContactChannel } from '../../src/main/services/contacts/twilioContactChannel'

const config = {
  accountSid: `AC${'a'.repeat(32)}`,
  apiKeySid: `SK${'b'.repeat(32)}`,
  apiKeySecret: 'private-key',
  sender: '+15550000000'
}
const sid = `SM${'c'.repeat(32)}`
const attempt = {
  id: 'primary',
  phone: '+15551111111',
  startedAt: Date.parse('2026-10-23T12:00:00Z'),
  status: 'sending' as const
}
const json = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 })

describe('Twilio callback channel', () => {
  it('posts once with API-key authentication and clear test wording; submission is not delivery', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ sid, from: config.sender, status: 'queued' }))
    const channel = new TwilioContactChannel(() => config, fetcher)
    expect(await channel.submit(attempt, 'test')).toEqual({ sid, sender: config.sender })
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`
    )
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString('base64')}`
    )
    expect(new URLSearchParams(String(init?.body)).get('Body')).toContain('TEST')
    expect(new URLSearchParams(String(init?.body)).get('To')).toBe(attempt.phone)
    expect(init?.redirect).toBe('error')
  })

  it.each(['queued', 'sent', 'sending', 'accepted', 'receiving', 'read', 'unexpected'])(
    'does not call %s SMS status delivered',
    async (status) => {
      const channel = new TwilioContactChannel(
        () => config,
        vi.fn<typeof fetch>().mockResolvedValue(json({ sid, status }))
      )
      expect((await channel.delivery(sid)).status).toBe('pending')
    }
  )
  it.each(['delivered', 'failed', 'undelivered', 'canceled'])(
    'maps a confirmed %s status',
    async (status) => {
      const channel = new TwilioContactChannel(
        () => config,
        vi.fn<typeof fetch>().mockResolvedValue(json({ sid, status }))
      )
      expect((await channel.delivery(sid)).status).toBe(
        status === 'delivered' ? 'delivered' : 'failed'
      )
    }
  )

  it('paginates replies and returns only timestamped inbound records', async () => {
    const next = `/2010-04-01/Accounts/${config.accountSid}/Messages.json?PageToken=next`
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ messages: [{ sid, direction: 'outbound-api' }], next_page_uri: next })
      )
      .mockResolvedValueOnce(
        json({
          messages: [
            {
              sid,
              direction: 'inbound',
              from: attempt.phone,
              to: config.sender,
              date_created: 'Fri, 23 Oct 2026 12:00:05 +0000',
              body: 'YES'
            }
          ],
          next_page_uri: null
        })
      )
    const channel = new TwilioContactChannel(() => config, fetcher)
    expect(await channel.replies({ ...attempt, sender: config.sender })).toEqual([
      {
        sid,
        from: attempt.phone,
        to: config.sender,
        receivedAt: attempt.startedAt + 5000,
        body: 'YES'
      }
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    const url = new URL(String(fetcher.mock.calls[0]![0]))
    expect(url.searchParams.get('From')).toBe(attempt.phone)
    expect(url.searchParams.get('To')).toBe(config.sender)
    expect(url.searchParams.get('DateSent>')).toBe('2026-10-22')
  })

  it('never retries or exposes provider bodies when a POST fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private phone and token', { status: 503 }))
    await expect(
      new TwilioContactChannel(() => config, fetcher).submit(attempt, 'real')
    ).rejects.toThrow(/^Contact channel unavailable$/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refuses missing configuration without making a network request', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      new TwilioContactChannel(() => null, fetcher).submit(attempt, 'real')
    ).rejects.toThrow('Contact channel unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/2010-04-01/Accounts/other/Messages.json'
  ])('never forwards credentials to an unexpected pagination target (%s)', async (next) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ messages: [], next_page_uri: next }))
    await expect(
      new TwilioContactChannel(() => config, fetcher).replies({ ...attempt, sender: config.sender })
    ).rejects.toThrow('Contact channel unavailable')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
