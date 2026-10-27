import type { ContactChannel, ContactAttempt, ContactReply } from './types'

/** Only instantiated under GRAMMIEGUIDE_E2E. Never talks to a provider. */
export function createContactFixture(): {
  channel: ContactChannel
  now: () => number
  advance: (ms: number) => void
  delivery: (status: 'pending' | 'delivered' | 'failed') => void
  reply: (id: string) => void
  failSubmission: (fail: boolean) => void
  count: () => number
} {
  let offset = 0
  let delivery: 'pending' | 'delivered' | 'failed' = 'pending'
  let fail = false
  const attempts: ContactAttempt[] = []
  const replies: ContactReply[] = []
  const now = (): number => Date.now() + offset
  return {
    channel: {
      submit: async (attempt) => {
        attempts.push(structuredClone(attempt))
        if (fail) throw new Error('Fixture unavailable')
        return { sid: `SM${String(attempts.length).padStart(32, '0')}`, sender: '+15550000000' }
      },
      delivery: async () => ({ status: delivery }),
      replies: async () => structuredClone(replies)
    },
    now,
    advance: (ms) => {
      offset += ms
    },
    delivery: (status) => {
      delivery = status
    },
    reply: (id) => {
      const attempt = attempts.findLast((attempt) => attempt.id === id)
      if (!attempt) throw new Error('No fixture attempt')
      replies.push({
        sid: `SM${String(replies.length + 1000).padStart(32, '0')}`,
        from: attempt.phone,
        to: '+15550000000',
        body: 'YES',
        receivedAt: Math.max(now(), attempt.startedAt + 1)
      })
    },
    failSubmission: (value) => {
      fail = value
    },
    count: () => attempts.length
  }
}
