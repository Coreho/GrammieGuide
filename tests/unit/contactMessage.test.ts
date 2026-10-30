import { describe, expect, it } from 'vitest'
import { contactMessage } from '../../src/shared/contactMessage'
import type { HomeContactState, ContactStatus } from '../../src/shared/contacts'

function state(status: ContactStatus): HomeContactState {
  return {
    contact: { id: 'preferred', name: 'Sarah' },
    request: {
      id: 'r',
      purpose: 'real',
      status,
      createdAt: 1000,
      updatedAt: 1000,
      expiresAt: 601000,
      fallbackAfterMs: 120000,
      attempts: [{ contactId: 'preferred', name: 'Sarah', status, startedAt: 1000 }]
    }
  }
}
describe('truthful callback wording', () => {
  it('shows sending until delivery is observed and distinguishes a YES', () => {
    expect(contactMessage(null, true, 2000).title).toBe('Sending…')
    expect(contactMessage(state('sending'), false, 2000).title).toBe('Sending…')
    expect(contactMessage(state('delivered'), false, 2000).title).toBe(
      'Request delivered to Sarah.'
    )
    expect(contactMessage(state('delivered'), false, 2000).title).not.toContain('saw')
    expect(contactMessage(state('answered'), false, 2000).title).toBe('Sarah saw your request.')
  })
  it.each(['failed', 'unknown', 'expired'] as const)(
    'directs her to the real telephone on %s without promising help',
    (status) => {
      const message = contactMessage(state(status), false, 602000)
      expect(message.detail).toContain('telephone')
      expect(message.title).not.toMatch(/delivered|saw|coming|notified/i)
    }
  )
  it('makes fallback explicit and shows a late preferred-contact acknowledgement', () => {
    const value = state('sending')
    value.request!.attempts.push({
      contactId: 'fallback',
      name: 'Tom',
      startedAt: 121000,
      status: 'sending'
    })
    expect(contactMessage(value, false, 122000).title).toBe('Asking Tom to call…')
    value.request!.attempts[0]!.status = 'answered'
    expect(contactMessage(value, false, 123000).title).toBe('Sarah saw your request.')
  })
  it('a delivered message with no answer eventually offers the telephone instead of reassurance', () => {
    expect(contactMessage(state('delivered'), false, 122000).title).toBe('No reply confirmed yet.')
    expect(contactMessage(state('delivered'), false, 122000).detail).toContain('telephone')
    expect(
      contactMessage({ ...state('delivered'), problem: 'unavailable' }, false, 2000).title
    ).not.toContain('delivered')
  })
})
