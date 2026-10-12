import {
  configSchema,
  CURRENT_SCHEMA_VERSION,
  mergeAdminPatch,
  toPublicConfig,
  type Config
} from '@shared/configSchema'
import { runMigrations } from '../../config/migrations/runner'

const FORMAT = 'GrammieGuide settings backup'
const BACKUP_VERSION = 1
const INVALID = 'This is not a valid GrammieGuide settings backup. Your settings have not changed.'
const NEWER = 'This backup needs a newer version. Please update GrammieGuide before restoring it.'

export class ConfigBackupError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate to allow only schema fields, then strip the known device secrets. */
export function buildConfigBackup(config: Config): string {
  return JSON.stringify(
    {
      format: FORMAT,
      backupVersion: BACKUP_VERSION,
      notice:
        'Photo and music files are not included. Import them separately on another device. Device secrets are not included.',
      config: toPublicConfig(configSchema.parse(config))
    },
    null,
    2
  )
}

/** Pure: no writes until the caller receives a fully validated replacement. */
export function parseConfigBackup(text: string, current: Config): Config {
  let backup: unknown
  try {
    backup = JSON.parse(text)
  } catch {
    throw new ConfigBackupError(INVALID)
  }
  if (!isRecord(backup) || backup.format !== FORMAT) throw new ConfigBackupError(INVALID)
  if (typeof backup.backupVersion === 'number' && backup.backupVersion > BACKUP_VERSION) {
    throw new ConfigBackupError(NEWER)
  }
  if (backup.backupVersion !== BACKUP_VERSION || !isRecord(backup.config)) {
    throw new ConfigBackupError(INVALID)
  }
  const config = backup.config
  // The boot runner deliberately accepts an empty store as first boot. A restore
  // must contain a complete setup, never silently replace it with fresh defaults.
  if (
    typeof config.schemaVersion !== 'number' ||
    !Number.isInteger(config.schemaVersion) ||
    config.schemaVersion < 1 ||
    !Array.isArray(config.tiles) ||
    !['weather', 'confusion', 'buddy', 'display', 'reliability'].every((key) =>
      isRecord(config[key])
    )
  ) {
    throw new ConfigBackupError(INVALID)
  }
  if (config.schemaVersion > CURRENT_SCHEMA_VERSION) throw new ConfigBackupError(NEWER)
  const migrated = runMigrations(config)
  if (!migrated.ok) throw new ConfigBackupError(INVALID)
  // Ignore incoming credentials (including ones added to a hand-edited file).
  return configSchema.parse(mergeAdminPatch(current, toPublicConfig(migrated.config)))
}
