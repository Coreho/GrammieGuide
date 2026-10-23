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
    deliveredAt?: number
    answeredAt?: number
  }[]
}

export interface HomeContactState {
  contact: { id: string; name: string; photoUrl?: string } | null
  request: ContactRequestSummary | null
  problem?: 'unavailable' | 'not-configured'
}
