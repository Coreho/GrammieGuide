import type { Migration } from './index'
import { DEFAULT_LOCAL_VOICE } from '@shared/buddy/localVoices'

/**
 * Adds the voice Buddy speaks with on this computer and makes it the voice he uses. Unlike other
 * migrations this overrides a saved setting, once, on purpose: the owner chose the free local
 * voice, and with the online voice left on every line first waits on Microsoft's endpoint, which
 * refuses them all when it breaks. The caregiver can switch the online voice back on in admin.
 */
export const migration: Migration = {
  version: 21,
  migrate(prev) {
    const config = prev as Record<string, unknown>
    const buddy = (config.buddy ?? {}) as Record<string, unknown>
    return {
      ...config,
      schemaVersion: 21,
      buddy: {
        ...buddy,
        cloudTtsEnabled: false,
        localVoice: buddy.localVoice ?? DEFAULT_LOCAL_VOICE
      }
    }
  }
}
