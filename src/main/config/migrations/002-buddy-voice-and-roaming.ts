import type { Migration } from './index'

/**
 * v1 -> v2: the finished Buddy (M4) adds three caregiver settings - reading
 * replies aloud, which voice, and whether he strolls around Home. Not a port
 * of an old-app store.js step: the old app kept its speech toggle in the
 * chat UI's own state and had no roaming setting.
 *
 * Existing values win over the defaults, so re-running on an already-v2
 * shape is harmless.
 */
export const migration: Migration = {
  version: 2,
  migrate(prev: unknown): unknown {
    const p = (typeof prev === 'object' && prev !== null ? prev : {}) as Record<string, unknown>
    const buddy = typeof p.buddy === 'object' && p.buddy !== null ? (p.buddy as Record<string, unknown>) : {}
    return {
      ...p,
      schemaVersion: 2,
      buddy: { voiceEnabled: true, ttsVoice: 'en-US-AriaNeural', roaming: true, ...buddy }
    }
  }
}
