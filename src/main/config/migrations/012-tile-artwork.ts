import type { Migration } from './index'

export const migration: Migration = {
  version: 12,
  // Both artwork and the matching palette are opt-in: preserve every saved tile and theme.
  migrate: (prev) => ({ ...(prev as Record<string, unknown>), schemaVersion: 12 })
}
