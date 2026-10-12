import type { Migration } from './index'

export const migration: Migration = {
  version: 11,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 11,
      music: {
        playlists: [],
        autoStopMinutes: 90,
        showNowPlayingChip: true,
        ...((p.music ?? {}) as Record<string, unknown>)
      }
    }
  }
}
