import type { Migration } from './index'

export const migration: Migration = {
  version: 4,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 4,
      buddy: { quickMessages: [], ...(p.buddy as Record<string, unknown>) }
    }
  }
}
