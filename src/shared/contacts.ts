/** No phone numbers, message text, provider IDs or credentials cross IPC. */
export type ContactStatus = 'sending' | 'delivered' | 'answered' | 'failed' | 'expired' | 'unknown'
export type ContactPurpose = 'real' | 'test'
export interface ContactRequestSummary {
  id: string
  purpose: ContactPurpose
  status: ContactStatus
  createdAt: number
  updatedAt: number
  expiresAt: number
  fallbackAfterMs?: number
  attempts: {
    contactId: string
    name?: string
    photoId?: string
    photoUrl?: string
    startedAt: number
    status: ContactStatus
    /** The provider accepted the text. A yes/no only: its message ID never crosses IPC. */
    submitted?: boolean
    deliveredAt?: number
    answeredAt?: number
  }[]
}

export interface HomeContactState {
  contact: { id: string; name: string; photoUrl?: string } | null
  request: ContactRequestSummary | null
  problem?: 'unavailable' | 'not-configured'
}

/**
 * A caregiver test that has a definite result no longer holds the tap guard, so a wrong
 * sender or key can be fixed and tried again at once. An uncertain one (unknown, still
 * sending) keeps it until expiry, like her real requests: it may have been sent.
 */
export function testSettled(request: { purpose: ContactPurpose; status: ContactStatus }): boolean {
  return (
    request.purpose === 'test' && (request.status === 'answered' || request.status === 'failed')
  )
}

export interface ContactTestState {
  /** The two people a callback request texts, in order. Names only. */
  people: { id: string; name: string }[]
  hasCredentials: boolean
  /** The latest test, whatever its outcome. Kept apart from her real requests. */
  test: ContactRequestSummary | null
  checkedAt: number
  problem?: 'not-configured' | 'help-request-active' | 'test-active' | 'unavailable'
}
