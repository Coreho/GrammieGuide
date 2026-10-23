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
  attempts: {
    contactId: string
    startedAt: number
    status: ContactStatus
    deliveredAt?: number
    answeredAt?: number
  }[]
}
