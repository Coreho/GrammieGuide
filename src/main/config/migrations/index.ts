import { migration as migration002 } from './002-buddy-voice-and-roaming'
import { migration as migration003 } from './003-tile-sizes'
import { migration as migration004 } from './004-buddy-quick-messages'
import { migration as migration005 } from './005-tile-colors'
import { migration as migration006 } from './006-buddy-interaction-settings'
import { migration as migration007 } from './007-buddy-chat-enabled'
import { migration as migration008 } from './008-browser-approved-sites'

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
export const migrations: Migration[] = [
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008
]
