import { configSchema, defaultConfig, CURRENT_SCHEMA_VERSION, type Config } from '@shared/configSchema'
import { migrations } from './index'

export type MigrationResult =
  | { ok: true; config: Config }
  | { ok: false; config: Config; reason: string; corruptBackup?: unknown }

/**
 * Replaces the old app's ~8 sequential, unconditional migration blocks in
 * store.js with one numbered file per schema version (see ./index.ts). Each
 * migration is a pure function, run in order, re-validated against the
 * current schema after every step. If anything fails validation, we back up
 * the corrupt value and fall back to defaults rather than booting the kiosk
 * with a broken config - the old app has no equivalent safety net.
 */
export function runMigrations(rawStored: unknown): MigrationResult {
  // electron-store hands back {} when there's no file yet (a fresh install),
  // not undefined - that's a first boot, not a corrupt config to back up.
  const isEmpty = typeof rawStored === 'object' && rawStored !== null && Object.keys(rawStored).length === 0
  if (rawStored === undefined || rawStored === null || isEmpty) {
    return { ok: true, config: defaultConfig() }
  }

  let working: unknown = rawStored
  const storedVersion =
    typeof working === 'object' && working !== null && 'schemaVersion' in working
      ? Number((working as { schemaVersion: unknown }).schemaVersion)
      : 0

  const applicable = migrations
    .filter((m) => m.version > storedVersion && m.version <= CURRENT_SCHEMA_VERSION)
    .sort((a, b) => a.version - b.version)

  for (const migration of applicable) {
    try {
      working = migration.migrate(working)
    } catch (err) {
      return {
        ok: false,
        config: defaultConfig(),
        reason: `migration v${migration.version} threw: ${String(err)}`,
        corruptBackup: rawStored
      }
    }
  }

  const parsed = configSchema.safeParse(working)
  if (!parsed.success) {
    return {
      ok: false,
      config: defaultConfig(),
      reason: `post-migration validation failed: ${parsed.error.message}`,
      corruptBackup: rawStored
    }
  }

  return { ok: true, config: parsed.data }
}
