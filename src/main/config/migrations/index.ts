export interface Migration {
  version: number
  /** Pure function: takes the previous (unvalidated) shape, returns the next shape. */
  migrate(prev: unknown): unknown
}

/**
 * One file per schema version goes here as the config evolves, e.g.:
 *   export { migration as migration002 } from './002-weather-locations-array'
 * and gets added to this array. Each old-app migration in store.js
 * (ghost-tile cleanup, location->locations[], AI tile add/remove, etc.)
 * becomes exactly one file like this when it's ported forward.
 */
export const migrations: Migration[] = []
