import type { ContactPurpose, ContactRequestSummary, ContactStatus } from '@shared/contacts'

export interface Contact {
  id: string
  phone: string
}
export interface ContactAttempt extends Contact {
  startedAt: number
  status: ContactStatus
  sid?: string
  sender?: string
  deliveredAt?: number
  answeredAt?: number
  replySid?: string
}
export interface SavedRequest {
  id: string
  purpose: ContactPurpose
  status: ContactStatus
  createdAt: number
  updatedAt: number
  expiresAt: number
  fallbackAfterMs: number
  contacts: Contact[]
  attempts: ContactAttempt[]
}
export interface RequestJournal {
  version: 1
  requests: SavedRequest[]
}
export interface RequestStore {
  load(): Promise<RequestJournal>
  save(journal: RequestJournal): Promise<void>
}
export interface RequestOptions {
  purpose: ContactPurpose
  contacts: Contact[]
  expiresAfterMs: number
  fallbackAfterMs: number
}
export interface ContactReply {
  sid: string
  from: string
  to: string
  receivedAt: number
  body: string
}
/** Implementations must bound network time and must never retry a submission. */
export interface ContactChannel {
  submit(
    attempt: ContactAttempt,
    purpose: ContactPurpose
  ): Promise<{ sid: string; sender?: string }>
  delivery(sid: string): Promise<{ status: 'pending' | 'delivered' | 'failed'; sender?: string }>
  replies(attempt: ContactAttempt): Promise<ContactReply[]>
}

export function summarize(request: SavedRequest): ContactRequestSummary {
  return {
    id: request.id,
    purpose: request.purpose,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    expiresAt: request.expiresAt,
    attempts: request.attempts.map((attempt) => ({
      contactId: attempt.id,
      startedAt: attempt.startedAt,
      status: attempt.status,
      ...(attempt.deliveredAt === undefined ? {} : { deliveredAt: attempt.deliveredAt }),
      ...(attempt.answeredAt === undefined ? {} : { answeredAt: attempt.answeredAt })
    }))
  }
}
