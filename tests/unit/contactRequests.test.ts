import { describe, expect, it } from 'vitest'
import { ContactRequests } from '../../src/main/services/contacts/contactRequests'
import type { ContactChannel, RequestJournal } from '../../src/main/services/contacts/types'

function fixture(): {
  make: () => ContactRequests
  channel: ContactChannel
  store: { load: () => Promise<RequestJournal>; save: (value: RequestJournal) => Promise<void> }
  sent: string[]
  advance: (ms: number) => void
  journal: () => RequestJournal
} {
  let time = Date.parse('2026-10-23T12:00:00Z')
  let journal: RequestJournal = { version: 1, requests: [] }
  const sent: string[] = []
  const channel: ContactChannel = {
    submit: async (attempt) => {
      sent.push(attempt.phone)
      return { sid: `message-${sent.length}`, sender: '+15550000000' }
    },
    delivery: async () => ({ status: 'pending' }),
    replies: async () => []
  }
  const store = {
    load: async () => structuredClone(journal),
    save: async (value: RequestJournal) => {
      journal = structuredClone(value)
    }
  }
  const make = (): ContactRequests => new ContactRequests(store, channel, () => time)
  return {
    make,
    channel,
    store,
    sent,
    advance: (ms: number) => {
      time += ms
    },
    journal: () => structuredClone(journal)
  }
}

const options = {
  purpose: 'real' as const,
  contacts: [
    { id: 'primary', phone: '+15551111111' },
    { id: 'fallback', phone: '+15552222222' }
  ],
  expiresAfterMs: 600_000,
  fallbackAfterMs: 60_000
}

describe('persisted callback requests', () => {
  it('serializes repeated taps, saves submission and resumes polling without sending twice', async () => {
    const f = fixture()
    const service = f.make()
    const [first, repeated] = await Promise.all([
      service.request(options),
      service.request(options)
    ])
    expect(first.id).toBe(repeated.id)
    expect(first.status).toBe('sending')
    expect(f.journal().requests[0]?.attempts[0]?.sid).toBe('message-1')
    f.channel.delivery = async () => ({ status: 'delivered' })
    const resumed = f.make()
    await resumed.poll()
    expect((await resumed.list())[0]?.status).toBe('delivered')
    expect(f.sent).toEqual(['+15551111111'])
  })

  it('never resends an accepted SMS when saving its SID failed', async () => {
    const f = fixture()
    const save = f.store.save
    let writes = 0
    f.store.save = async (journal) => {
      if (++writes === 2) throw new Error('disk unavailable')
      await save(journal)
    }
    await expect(f.make().request(options)).rejects.toThrow('Request history unavailable')
    expect(f.journal().requests[0]?.attempts[0]?.sid).toBeUndefined()
    const restarted = f.make()
    await restarted.poll()
    expect((await restarted.list())[0]?.attempts[0]?.status).toBe('unknown')
    expect(f.sent).toHaveLength(1)
  })

  it('does not send at all when the durable intent cannot be written', async () => {
    const f = fixture()
    f.store.save = async () => {
      throw new Error('disk full with private details')
    }
    const service = f.make()
    await expect(service.request(options)).rejects.toThrow('Request history unavailable')
    await expect(service.request(options)).rejects.toThrow('Request history unavailable')
    expect(f.sent).toEqual([])
  })

  it('treats an uncertain POST as unknown and only sends the distinct fallback at its deadline', async () => {
    const f = fixture()
    f.channel.submit = async (attempt) => {
      f.sent.push(attempt.phone)
      throw new Error('timeout')
    }
    const service = f.make()
    expect((await service.request(options)).status).toBe('unknown')
    await service.poll()
    expect(f.sent).toHaveLength(1)
    f.advance(60_000)
    await service.poll()
    await service.poll()
    expect(f.sent).toEqual(['+15551111111', '+15552222222'])
    expect((await service.list())[0]?.status).toBe('unknown')
  })

  it('marks a queued message unknown at timeout, without ever claiming delivery', async () => {
    const f = fixture()
    const service = f.make()
    await service.request({ ...options, contacts: options.contacts.slice(0, 1) })
    f.advance(60_000)
    await service.poll()
    expect((await service.list())[0]?.status).toBe('unknown')
    f.channel.delivery = async () => {
      throw new Error('offline')
    }
    await service.poll()
    expect((await service.list())[0]?.status).toBe('unknown')
    expect(f.sent).toHaveLength(1)
  })

  it('keeps delivery separate from acknowledgement and preserves it through failed polls', async () => {
    const f = fixture()
    const service = f.make()
    await service.request(options)
    f.channel.delivery = async () => ({ status: 'delivered' })
    await service.poll()
    expect((await service.list())[0]?.status).toBe('delivered')
    f.channel.delivery = async () => {
      throw new Error('offline')
    }
    await service.poll()
    expect((await service.list())[0]?.status).toBe('delivered')
    expect((await service.list())[0]?.attempts[0]?.answeredAt).toBeUndefined()
  })

  it('polls the preferred contact after fallback and preserves a late YES across restart', async () => {
    const f = fixture()
    const service = f.make()
    await service.request(options)
    f.advance(60_000)
    await service.poll()
    expect(f.sent).toHaveLength(2)
    f.channel.replies = async (attempt) =>
      attempt.id === 'primary'
        ? [
            {
              sid: 'inbound-1',
              from: attempt.phone,
              to: '+15550000000',
              receivedAt: attempt.startedAt + 61_000,
              body: ' yes '
            }
          ]
        : []
    f.advance(2000)
    await service.poll()
    const restarted = f.make()
    expect((await restarted.list())[0]?.status).toBe('answered')
    expect((await restarted.list())[0]?.attempts[0]?.status).toBe('answered')
    await restarted.poll()
    expect(f.sent).toHaveLength(2)
    expect(f.journal().requests[0]?.attempts[0]?.replySid).toBe('inbound-1')
  })

  it('rejects stale, wrong-number, wrong-sender, future and non-YES replies', async () => {
    const f = fixture()
    const service = f.make()
    await service.request(options)
    const startedAt = f.journal().requests[0]!.createdAt
    const valid = {
      sid: 'reply',
      from: '+15551111111',
      to: '+15550000000',
      receivedAt: startedAt + 1000,
      body: 'YES'
    }
    f.advance(2000)
    f.channel.replies = async () => [
      { ...valid, sid: 'stale', receivedAt: startedAt },
      { ...valid, sid: 'wrong-phone', from: '+15559999999' },
      { ...valid, sid: 'wrong-sender', to: '+15559999999' },
      { ...valid, sid: 'future', receivedAt: startedAt + 3000 },
      { ...valid, sid: 'no', body: 'yes please' }
    ]
    await service.poll()
    expect((await service.list())[0]?.status).toBe('sending')
  })

  it('falls back immediately on confirmed failure and never repeats the fallback', async () => {
    const f = fixture()
    const service = f.make()
    f.channel.delivery = async () => ({ status: 'failed' })
    await service.request(options)
    await service.poll()
    await service.poll()
    await service.poll()
    expect((await service.list())[0]?.status).toBe('failed')
    expect(f.sent).toEqual(['+15551111111', '+15552222222'])
  })

  it('expires at the configured boundary and permits a new request only then', async () => {
    const f = fixture()
    const service = f.make()
    const first = await service.request(options)
    f.advance(599_999)
    expect((await service.request(options)).id).toBe(first.id)
    f.advance(1)
    await service.poll()
    expect((await service.list())[0]?.status).toBe('expired')
    expect((await service.request(options)).id).not.toBe(first.id)
    expect(f.sent).toHaveLength(2)
    expect((await service.list())[0]?.attempts).toHaveLength(1)
  })

  it('does not let a test disturb an active real request or share its recipient', async () => {
    const f = fixture()
    const service = f.make()
    const first = await service.request(options)
    await expect(service.request({ ...options, purpose: 'test' })).rejects.toThrow('already active')
    const test = await service.request({
      ...options,
      purpose: 'test',
      contacts: [{ id: 'other', phone: '+15553333333' }]
    })
    expect(test.purpose).toBe('test')
    expect((await service.list())[0]?.id).toBe(first.id)
    expect(await service.list()).toHaveLength(2)
  })

  it('never exposes phone numbers, provider IDs or reply text in summaries', async () => {
    const f = fixture()
    const service = f.make()
    await service.request(options)
    const output = JSON.stringify(await service.list())
    expect(output).not.toContain('+1555')
    expect(output).not.toContain('message-1')
    expect(output).not.toContain('phone')
    expect(output).not.toContain('sender')
  })

  it('saves distinct delivery and acknowledgement observations but does not rewrite unchanged polls', async () => {
    const f = fixture()
    const observations: RequestJournal[] = []
    const save = f.store.save
    f.store.save = async (journal) => {
      observations.push(structuredClone(journal))
      await save(journal)
    }
    const service = f.make()
    await service.request(options)
    const writes = observations.length
    await service.poll()
    await service.poll()
    expect(observations).toHaveLength(writes)
    f.advance(1000)
    f.channel.delivery = async () => ({ status: 'delivered' })
    f.channel.replies = async (attempt) => [
      {
        sid: 'reply-one',
        from: attempt.phone,
        to: '+15550000000',
        receivedAt: attempt.startedAt + 1000,
        body: 'YES'
      }
    ]
    await service.poll()
    expect(observations.slice(writes).map((j) => j.requests[0]?.status)).toEqual([
      'delivered',
      'answered'
    ])
    f.advance(60_000)
    await service.poll()
    expect(f.sent).toHaveLength(1)
  })

  it('never consumes a duplicate reply SID for a subsequent request, including after restart', async () => {
    const f = fixture()
    const service = f.make()
    await service.request(options)
    f.advance(1000)
    f.channel.replies = async (attempt) => [
      {
        sid: 'same-reply',
        from: attempt.phone,
        to: '+15550000000',
        receivedAt: attempt.startedAt + 1000,
        body: 'YES'
      }
    ]
    await service.poll()
    expect((await service.list())[0]?.status).toBe('answered')
    f.advance(600_000)
    const restarted = f.make()
    await restarted.request(options)
    f.advance(1000)
    await restarted.poll()
    expect((await restarted.list())[1]?.status).toBe('sending')
  })

  it('keeps a rolling 1,000 outcomes without disabling future requests', async () => {
    const f = fixture()
    const first = await f.make().request(options)
    const journal = f.journal()
    const original = journal.requests[0]!
    journal.requests = Array.from({ length: 1000 }, (_, index) => ({
      ...structuredClone(original),
      id: `old-${index}`
    }))
    await f.store.save(journal)
    f.advance(600_000)
    const service = f.make()
    const next = await service.request(options)
    const result = await service.list()
    expect(result).toHaveLength(1000)
    expect(result[0]?.id).toBe('old-1')
    expect(result.at(-1)?.id).toBe(next.id)
    expect(next.id).not.toBe(first.id)
  })

  it.each([
    { expiresAfterMs: 0 },
    { expiresAfterMs: Infinity },
    { fallbackAfterMs: 600_000 },
    { contacts: [] },
    { contacts: [options.contacts[0], options.contacts[0]] },
    { contacts: [{ id: 'contact', phone: '123' }] }
  ])('refuses invalid settings before contacting the channel: %j', async (patch) => {
    const f = fixture()
    await expect(f.make().request({ ...options, ...patch } as typeof options)).rejects.toThrow(
      'Invalid contact'
    )
    expect(f.sent).toHaveLength(0)
  })
})
