import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import type { RequestJournal, RequestStore } from './types'

const timestamp = z.number().int().nonnegative().safe()
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/)
const status = z.enum(['sending', 'delivered', 'answered', 'failed', 'expired', 'unknown'])
const contact = z.object({
  id,
  phone,
  name: z.string().trim().min(1).max(20).optional(),
  photoId: z.string().uuid().optional()
})
const attempt = contact.extend({
  startedAt: timestamp,
  status,
  sid: id.optional(),
  sender: phone.optional(),
  deliveredAt: timestamp.optional(),
  answeredAt: timestamp.optional(),
  replySid: id.optional()
})
const schema = z.object({
  version: z.literal(1),
  requests: z
    .array(
      z.object({
        id,
        purpose: z.enum(['real', 'test']),
        status,
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: timestamp,
        fallbackAfterMs: z.number().int().min(1000).max(86_400_000),
        contacts: z.array(contact).min(1).max(2),
        attempts: z.array(attempt).min(1).max(2)
      })
    )
    .max(1000)
})

function validate(value: unknown): RequestJournal {
  const journal = schema.parse(value)
  const requestIds = new Set<string>()
  const replies = new Set<string>()
  for (const request of journal.requests) {
    if (
      requestIds.has(request.id) ||
      request.expiresAt <= request.createdAt ||
      request.expiresAt - request.createdAt > 86_400_000 ||
      request.fallbackAfterMs >= request.expiresAt - request.createdAt ||
      new Set(request.contacts.map((c) => c.id)).size !== request.contacts.length ||
      new Set(request.contacts.map((c) => c.phone)).size !== request.contacts.length ||
      request.attempts.length > request.contacts.length
    )
      throw new Error('Invalid request journal')
    requestIds.add(request.id)
    for (const [index, item] of request.attempts.entries()) {
      const contact = request.contacts[index]!
      if (
        item.id !== contact.id ||
        item.phone !== contact.phone ||
        item.startedAt < request.createdAt ||
        item.startedAt >= request.expiresAt ||
        (item.status === 'answered' && (!item.replySid || item.answeredAt === undefined)) ||
        (item.status === 'delivered' && (!item.sid || item.deliveredAt === undefined)) ||
        (item.replySid && replies.has(item.replySid))
      )
        throw new Error('Invalid request journal')
      if (item.replySid) replies.add(item.replySid)
    }
  }
  return journal
}

/** Corruption fails closed. An empty replacement could silently notify family twice. */
export class DiskRequestStore implements RequestStore {
  private readonly path: string
  constructor(private readonly folder: string) {
    this.path = join(folder, 'contact-requests.json')
  }

  async load(): Promise<RequestJournal> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, requests: [] }
      throw new Error('Request history unavailable')
    }
    try {
      if (Buffer.byteLength(raw) > 2_000_000) throw new Error('History too large')
      return validate(JSON.parse(raw))
    } catch {
      // Do not echo any part of the file: it contains caregiver-only phone numbers.
      throw new Error('Request history unavailable')
    }
  }

  async save(journal: RequestJournal): Promise<void> {
    const raw = JSON.stringify(validate(journal))
    if (Buffer.byteLength(raw) > 2_000_000) throw new Error('Request history unavailable')
    await mkdir(this.folder, { recursive: true })
    const temporary = join(this.folder, `.contact-requests-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, raw, { encoding: 'utf8', flush: true, flag: 'wx' })
      await rename(temporary, this.path)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }
}
