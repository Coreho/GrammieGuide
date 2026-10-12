import type { Migration } from './index'

export const migration: Migration = {
  version: 9,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    const photos = (p.photos ?? {}) as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 9,
      photos: { slideshowEnabled: false, ...photos }
    }
  }
}
