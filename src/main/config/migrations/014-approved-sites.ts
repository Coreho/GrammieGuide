import type { Migration } from './index'

export const migration: Migration = {
  version: 14,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return { approvedSites: [], ...p, schemaVersion: 14 }
  }
}
