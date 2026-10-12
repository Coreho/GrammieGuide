import type { Migration } from './index'

export const migration: Migration = {
  version: 10,
  // photoId is optional: existing tiles retain their familiar icons and positions.
  migrate: (prev) => ({ ...(prev as Record<string, unknown>), schemaVersion: 10 })
}
