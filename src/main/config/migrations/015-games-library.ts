import type { Migration } from './index'
import { defaultGamesConfig } from '../../../shared/games/gamesSchema'

export const migration: Migration = {
  version: 15,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    return {
      games: defaultGamesConfig(),
      ...p,
      schemaVersion: 15
    }
  }
}
