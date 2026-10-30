import type { Migration } from './index'

export const migration: Migration = {
  version: 17,
  migrate(prev) {
    const config = prev as Record<string, unknown>
    const buddy = config.buddy as Record<string, unknown> | undefined
    return {
      ...config,
      schemaVersion: 17,
      buddy: { ...buddy, personalFacts: buddy?.personalFacts ?? [] }
    }
  }
}
