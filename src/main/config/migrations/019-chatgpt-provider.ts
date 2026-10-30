import type { Migration } from './index'

/** Version the new enum choice without enabling it or moving credentials into config. */
export const migration: Migration = {
  version: 19,
  migrate(prev) {
    return { ...(prev as Record<string, unknown>), schemaVersion: 19 }
  }
}
