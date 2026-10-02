import type { Migration } from './index'

export const migration: Migration = {
  version: 7,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    const buddy = (p.buddy ?? {}) as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 7,
      buddy: { chatEnabled: true, ...buddy }
    }
  }
}
