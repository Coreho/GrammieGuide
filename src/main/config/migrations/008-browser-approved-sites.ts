import type { Migration } from './index'

export const migration: Migration = {
  version: 8,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 8,
      // Empty on purpose. Her existing tiles are their own approval (see
      // shared/browser/approvedSites.ts), so nobody's Home changes behaviour on
      // upgrade; this list is only for sites she reaches beyond those.
      browser: { approvedSites: [], ...((p.browser as object) ?? {}) }
    }
  }
}