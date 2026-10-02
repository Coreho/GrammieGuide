import type { Migration } from './index'

export const migration: Migration = {
  version: 6,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    const { roaming, ...buddy } = (p.buddy ?? {}) as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 6,
      // Keep explicit new choices; only the old false setting opts out of the default strolls.
      buddy: { motion: roaming === false ? 'still' : 'roam', tapAction: 'reaction', ...buddy }
    }
  }
}
