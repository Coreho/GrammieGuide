import { describe, expect, it, vi } from 'vitest'
import {
  ContactController,
  TEST_EXPIRES_MS,
  TEST_UNCONFIRMED_MS
} from '../../src/main/services/contacts/contactController'
import { ContactRequests } from '../../src/main/services/contacts/contactRequests'
import { TwilioContactChannel } from '../../src/main/services/contacts/twilioContactChannel'
import {
  ContactRejectedError,
  type ContactChannel,
  type ContactReply,
  type RequestJournal
} from '../../src/main/services/contacts/types'
import { defaultConfig } from '../../src/shared/configSchema'
import { contactTestProblem, describeContactTest } from '../../src/shared/contactTest'
import type { ContactConfig } from '../../src/shared/contactSettings'

const SENDER = '+15550000000'
const credentials = {
  accountSid: `AC${'a'.repeat(32)}`,
  apiKeySid: `SK${'b'.repeat(32)}`,
  apiKeySecret: 'secret',
  sender: SENDER
}

// The fixture's shape is its own documentation; spelling it out twice adds nothing.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture() {
  let config: ContactConfig = {
    ...defaultConfig().contacts,
    people: [
      { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
      { id: 'fallback', name: 'Tom', phone: '+15552222222' },
      { id: 'third', name: 'Ann', phone: '+15553333333' }
    ],
    credentials
  }
  let journal: RequestJournal = { version: 1, requests: [] }
  let time = Date.parse('2026-11-12T12:00:00Z')
  const sent: { phone: string; purpose: string }[] = []
  const replies: ContactReply[] = []
  let submitError: Error | null = null
  let delivery: 'pending' | 'delivered' | 'failed' = 'pending'
  const channel: ContactChannel = {
    submit: async (attempt, purpose) => {
      if (submitError) throw submitError
      sent.push({ phone: attempt.phone, purpose })
      return { sid: `message-${sent.length}`, sender: SENDER }
    },
    delivery: async () => ({ status: delivery }),
    replies: async (attempt) => replies.filter((reply) => reply.from === attempt.phone)
  }
  const store = {
    load: async () => structuredClone(journal),
    save: async (value: RequestJournal) => {
      journal = structuredClone(value)
    }
  }
  const build = (): { requests: ContactRequests; controller: ContactController } => {
    const requests = new ContactRequests(store, channel, () => time)
    const controller = new ContactController(
      requests,
      () => config,
      (value) => {
        config = value
      },
      async () => undefined,
      () => time
    )
    return { requests, controller }
  }
  return {
    ...build(),
    restart: build,
    sent,
    journal: () => structuredClone(journal),
    setConfig: (patch: Partial<ContactConfig>) => {
      config = { ...config, ...patch } as ContactConfig
    },
    advance: (ms: number) => {
      time += ms
    },
    now: () => time,
    failSubmit: (error: Error | null) => {
      submitError = error
    },
    deliver: (status: typeof delivery) => {
      delivery = status
    },
    reply: (phone: string, body = 'YES') => {
      replies.push({
        sid: `reply-${replies.length}`,
        from: phone,
        to: SENDER,
        receivedAt: time,
        body
      })
    }
  }
}
const time = (ms: number): string => new Date(ms).toISOString().slice(11, 19)

describe('caregiver callback test', () => {
  it('sends one marked text to the chosen saved person, and repeated taps never send another', async () => {
    const f = fixture()
    const [first, second] = await Promise.all([
      f.controller.startTest('fallback'),
      f.controller.startTest('fallback')
    ])
    expect(f.sent).toEqual([{ phone: '+15552222222', purpose: 'test' }])
    expect(first.problem).toBeUndefined()
    expect(second.problem).toBe('test-active')
    expect(second.test?.id).toBe(first.test?.id)
    expect((await f.controller.startTest('preferred')).problem).toBe('test-active')
    expect(f.sent).toHaveLength(1)
    const saved = f.journal().requests[0]!
    expect(saved.expiresAt - saved.createdAt).toBe(TEST_EXPIRES_MS)
    expect(saved.fallbackAfterMs).toBe(TEST_UNCONFIRMED_MS)
    expect(JSON.stringify(first)).not.toMatch(/\+1555|message-1|secret/)
  })

  it('reports sent, delivered and a new YES as separate results', async () => {
    const f = fixture()
    let state = await f.controller.startTest('preferred')
    let report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps.map((step) => step.state)).toEqual(['yes', 'waiting', 'waiting'])
    expect(report.open).toBe(true)
    // A YES from before this test began is stale and never counts.
    f.reply('+15551111111')
    f.advance(1000)
    f.deliver('delivered')
    await f.requests.poll()
    state = await f.controller.testState()
    report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps.map((step) => step.state)).toEqual(['yes', 'yes', 'waiting'])
    f.reply('+15551111111', 'ok')
    f.reply('+15551111111')
    await f.requests.poll()
    state = await f.controller.testState()
    report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps.map((step) => step.state)).toEqual(['yes', 'yes', 'yes'])
    expect(report.steps[2]!.text).toContain('Sarah replied YES')
    expect(report.open).toBe(false)
    expect(state.checkedAt).toBe(f.now())
  })

  it('never calls an undelivered, timed-out or unanswered test delivered or seen', async () => {
    const f = fixture()
    await f.controller.startTest('preferred')
    f.advance(TEST_UNCONFIRMED_MS)
    await f.requests.poll()
    let state = await f.controller.testState()
    expect(state.test?.status).toBe('unknown')
    let report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps.map((step) => step.state)).toEqual(['yes', 'waiting', 'waiting'])
    f.advance(TEST_EXPIRES_MS)
    await f.requests.poll()
    state = await f.controller.testState()
    report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps.map((step) => step.state)).toEqual(['yes', 'no', 'no'])
    expect(report.open).toBe(false)
    expect(JSON.stringify(report)).not.toMatch(/coming|on (her|his|their) way|call(ed|ing) her/i)
    // A reply after the test ended is late and changes nothing.
    f.reply('+15551111111')
    await f.requests.poll()
    expect((await f.controller.testState()).test?.status).toBe('expired')
  })

  it('a refusal by Twilio is a definite failure that can be fixed and retried at once', async () => {
    const f = fixture()
    f.failSubmit(new ContactRejectedError())
    const state = await f.controller.startTest('preferred')
    expect(state.test?.status).toBe('failed')
    const report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps.map((step) => step.state)).toEqual(['no', 'not-reached', 'not-reached'])
    expect(report.open).toBe(false)
    await expect(f.controller.setCredentials(credentials)).resolves.toBeUndefined()
    f.failSubmit(null)
    const retried = await f.controller.startTest('preferred')
    expect(retried.problem).toBeUndefined()
    expect(retried.test?.id).not.toBe(state.test?.id)
    expect(f.sent).toHaveLength(1)
  })

  it('an uncertain submission is unknown, is never resent, and survives a restart', async () => {
    const f = fixture()
    f.failSubmit(new Error('socket closed'))
    const state = await f.controller.startTest('preferred')
    expect(state.test?.status).toBe('unknown')
    const report = describeContactTest(state.test!, f.now(), time)
    expect(report.steps[0]).toMatchObject({ state: 'no' })
    expect(report.steps[0]!.text).toContain('not sent again')
    f.failSubmit(null)
    const restarted = f.restart()
    await restarted.requests.poll()
    expect((await restarted.controller.startTest('preferred')).problem).toBe('test-active')
    expect((await restarted.controller.testState()).test?.id).toBe(state.test?.id)
    expect(f.sent).toHaveLength(0)
    f.advance(TEST_EXPIRES_MS)
    expect((await restarted.controller.startTest('preferred')).problem).toBeUndefined()
    expect(f.sent).toHaveLength(1)
  })

  it('refuses plainly without credentials, for an unsaved person, or beyond the two texted people', async () => {
    const f = fixture()
    expect((await f.controller.startTest('third')).problem).toBe('not-configured')
    expect((await f.controller.startTest('+15559999999')).problem).toBe('not-configured')
    expect((await f.controller.startTest({ id: 'preferred' })).problem).toBe('not-configured')
    f.setConfig({ credentials: undefined })
    const state = await f.controller.startTest('preferred')
    expect(state.problem).toBe('not-configured')
    expect(state.hasCredentials).toBe(false)
    expect(contactTestProblem(state)).toContain('No test was sent')
    expect(f.sent).toHaveLength(0)
  })

  it('never sends a test while her own request is open, and leaves that request alone', async () => {
    const f = fixture()
    f.setConfig({ enabled: true })
    const home = await f.controller.request()
    const state = await f.controller.startTest('fallback')
    expect(state.problem).toBe('help-request-active')
    expect(state.test).toBeNull()
    expect(f.sent).toEqual([{ phone: '+15551111111', purpose: 'real' }])
    expect((await f.controller.home()).request?.id).toBe(home.request?.id)
  })

  it('an open test never blocks her request, hides from Home, and lets her YES count first', async () => {
    const f = fixture()
    f.setConfig({ enabled: true })
    const test = await f.controller.startTest('preferred')
    expect((await f.controller.home()).request).toBeNull()
    f.advance(1000)
    const home = await f.controller.request()
    expect(home.problem).toBeUndefined()
    expect(home.request?.purpose).toBe('real')
    expect(f.sent.map((entry) => entry.purpose)).toEqual(['test', 'real'])
    f.advance(1000)
    f.reply('+15551111111')
    await f.requests.poll()
    expect((await f.controller.home()).request?.status).toBe('answered')
    const after = await f.controller.testState()
    expect(after.test?.id).toBe(test.test?.id)
    expect(after.test?.status).not.toBe('answered')
  })

  it('reading the test state never sends', async () => {
    const f = fixture()
    await f.controller.startTest('preferred')
    for (let index = 0; index < 5; index++) await f.controller.testState()
    await f.restart().controller.testState()
    expect(f.sent).toHaveLength(1)
  })
})

describe('Twilio refusals', () => {
  const attempt = {
    id: 'preferred',
    phone: '+15551111111',
    startedAt: 0,
    status: 'sending' as const
  }
  it.each([400, 401, 403, 404, 429])('treats HTTP %i on submit as refused', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private phone and token', { status }))
    const error = await new TwilioContactChannel(() => credentials, fetcher)
      .submit(attempt, 'test')
      .catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ContactRejectedError)
    expect((error as Error).message).toBe('Contact channel unavailable')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('keeps a server error or a lost response uncertain', async () => {
    for (const fetcher of [
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })),
      vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))
    ]) {
      const error = await new TwilioContactChannel(() => credentials, fetcher)
        .submit(attempt, 'test')
        .catch((reason: unknown) => reason)
      expect(error).not.toBeInstanceOf(ContactRejectedError)
    }
  })
  it('does not treat a refused read as a refused text', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }))
    const error = await new TwilioContactChannel(() => credentials, fetcher)
      .delivery(`SM${'c'.repeat(32)}`)
      .catch((reason: unknown) => reason)
    expect(error).not.toBeInstanceOf(ContactRejectedError)
  })
})
