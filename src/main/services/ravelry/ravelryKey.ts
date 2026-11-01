import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { CredentialCodec } from '../chatgpt/credentials'

const keySchema = z.object({ username: z.string().min(1), key: z.string().min(1) })
export type RavelryKey = z.infer<typeof keySchema>

/** Separate from config and backup archives, like the ChatGPT sign-in. Never plain text. */
export class RavelryKeyStore {
  constructor(
    private readonly file: string,
    private readonly codec: CredentialCodec
  ) {}

  /** A file Windows can no longer decrypt reads as no key: the caregiver just enters it again. */
  load(): RavelryKey | null {
    if (!existsSync(this.file)) return null
    try {
      return keySchema.parse(JSON.parse(this.codec.decrypt(readFileSync(this.file))))
    } catch {
      return null
    }
  }

  save(value: RavelryKey): void {
    const encrypted = this.codec.encrypt(JSON.stringify(keySchema.parse(value)))
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, encrypted, { mode: 0o600, flush: true })
    renameSync(temporary, this.file)
  }

  clear(): void {
    rmSync(this.file, { force: true })
  }
}
