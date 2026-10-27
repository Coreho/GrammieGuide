import type { Migration } from './index'
import { DEFAULT_LOCAL_VOICE } from '@shared/buddy/localVoices'

/** Adds the voice Buddy speaks with on this computer; the online voice settings stay as they are. */
export const migration: Migration = {
  version: 21,
  migrate(prev) {
    const config = prev as Record<string, unknown>
    const buddy = (config.buddy ?? {}) as Record<string, unknown>
    return {
      ...config,
      schemaVersion: 21,
      buddy: { ...buddy, localVoice: buddy.localVoice ?? DEFAULT_LOCAL_VOICE }
    }
  }
}
