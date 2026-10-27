import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'

const profileSchema = z.object({
  clientId: z.string().regex(/^oaiapp_[A-Za-z0-9_-]+$/),
  issuer: z.string().optional(),
  subject: z.string().optional(),
  email: z.string().optional(),
  access: z.string().optional(),
  refresh: z.string().optional(),
  idToken: z.string().optional(),
  expires: z.number().optional(),
  scopes: z.array(z.string()).default([]),
  verifiedModel: z.string().optional(),
  welcomed: z.boolean().default(false)
})
const credentialsSchema = z.object({
  hostId: z.string().startsWith('urn:uuid:'),
  activeId: z.string().optional(),
  profiles: z.array(profileSchema)
})
export type ChatGptProfile = z.infer<typeof profileSchema>
export type ChatGptCredentials = z.infer<typeof credentialsSchema>
export type CredentialCodec = {
  encrypt: (value: string) => Buffer
  decrypt: (value: Buffer) => string
}

/** Separate from config and backup archives. Never fall back to plaintext. */
export class CredentialStore {
  constructor(
    private file: string,
    private codec: CredentialCodec
  ) {}
  load(): ChatGptCredentials {
    if (existsSync(this.file))
      return credentialsSchema.parse(JSON.parse(this.codec.decrypt(readFileSync(this.file))))
    const fresh = { hostId: `urn:uuid:${randomUUID()}`, profiles: [] }
    this.save(fresh)
    return fresh
  }
  save(value: ChatGptCredentials): void {
    const encrypted = this.codec.encrypt(JSON.stringify(credentialsSchema.parse(value)))
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, encrypted, { mode: 0o600, flush: true })
    renameSync(temporary, this.file)
  }
}
