import type { Migration } from './index'

// Optional sources are opt-in: never replace a caregiver's saved feed or site.
export const migration: Migration = {
  version: 16,
  migrate(prev) {
    return { ...(prev as Record<string, unknown>), schemaVersion: 16 }
  }
}
