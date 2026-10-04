import Store from 'electron-store'
import { app } from 'electron'
import { copyFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defaultConfig, type Config } from '@shared/configSchema'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'
import { applyConfigPatch } from './applyConfigPatch'
import { runMigrations } from './migrations/runner'

/**
 * The persistence layer every admin save goes through.
 *
 * The Store is created lazily, inside loadConfig, on purpose. electron-store reads
 * its file in the constructor and rethrows a JSON SyntaxError (clearInvalidConfig
 * defaults to false), and this module is imported at the top of index.ts - before
 * app.whenReady. A truncated, zero-length or hand-edited file therefore used to
 * crash the main process before the backup-and-defaults path below could run, and
 * the watchdog would relaunch it into the same crash. On a kiosk that is the worst
 * possible failure, so a bad file is now copied aside and we start fresh.
 */

type StoreHandle = Store<Record<string, unknown>>

let raw: StoreHandle | null = null
let cached: Config | null = null

/** Long enough for a zod message to be readable, short enough for a log line. */
const MAX_REASON_CHARS = 300

/**
 * Copy the raw bytes of whatever is at `name`, and return the backup's file name.
 * A copy rather than a re-serialised dump: the point is to preserve exactly what
 * was on disk, including the part that failed to parse.
 */
function preserveFile(name: string, prefix: string, contents?: string): string | null {
  const backupName = `${prefix}${Date.now()}.json`
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) return null
    const source = join(dir, name)
    if (contents === undefined) {
      if (!existsSync(source)) return null
      copyFileSync(source, join(dir, backupName))
    } else {
      writeFileSync(join(dir, backupName), contents, 'utf8')
    }
    return backupName
  } catch {
    // Best-effort. Losing the backup must never stop the kiosk booting.
    return null
  }
}

/**
 * One `config-reset` event per reset, and never anything from the config itself.
 *
 * Two redaction traps live here. A JSON SyntaxError quotes the offending source
 * in its message, and a migration's thrown TypeError quotes the values it choked
 * on - either would put the API key or PIN hash in the log. So the reason is
 * rebuilt from a fixed vocabulary: a classification, plus for a validation failure
 * the zod message with whitespace collapsed and truncated.
 */
function recordReset(reason: string, backup: string | null): void {
  let detail: string
  if (reason.startsWith('migration v')) {
    // "migration v3 threw: TypeError: ..." - keep only the version.
    detail = reason.slice(0, reason.indexOf('threw') + 'threw'.length)
  } else if (reason.startsWith('post-migration validation failed')) {
    const collapsed = reason.slice('post-migration validation failed:'.length).replace(/\s+/g, ' ')
    detail = collapsed.slice(0, MAX_REASON_CHARS)
  } else {
    detail = reason
  }
  logReliabilityEvent({
    op: 'config-reset',
    ok: false,
    detail: `${detail} (${backup ?? 'backup failed'})`
  })
}

function openStore(clearInvalid: boolean): StoreHandle {
  return new Store<Record<string, unknown>>({
    name: 'grammieguide-config',
    // clearInvalid only after we have copied the file aside, never before.
    ...(clearInvalid ? { clearInvalidConfig: true } : {})
  })
}

function store(): StoreHandle {
  if (!raw) {
    try {
      raw = openStore(false)
    } catch (error) {
      // Only a parse failure is recoverable here. EPERM/EBUSY and friends are
      // rethrown exactly as before: they are not the file's fault, and silently
      // starting from defaults would hide a real disk problem.
      if (!(error instanceof SyntaxError)) throw error
      // Copy first: conf would otherwise clear the file we are trying to keep.
      const backup = preserveFile('grammieguide-config.json', 'config.corrupt-')
      recordReset('config file was not valid JSON', backup)
      raw = openStore(true)
    }
  }
  return raw
}

export function loadConfig(): Config {
  if (cached) return cached
  const handle = store()
  const result = runMigrations(handle.store)
  if (!result.ok) {
    recordReset(
      result.reason,
      preserveFile(
        'grammieguide-config.json',
        'config.corrupt-',
        JSON.stringify(result.corruptBackup, null, 2)
      )
    )
  }
  cached = result.config
  handle.set(cached as unknown as Record<string, unknown>)
  return cached
}

export function getConfig(): Config {
  return cached ?? loadConfig()
}

/**
 * Applies a patch, or throws before anything is written. A rejected save leaves
 * both the in-memory cache and the file exactly as they were.
 */
export function setConfig(patch: Partial<Config>): Config {
  const result = applyConfigPatch(getConfig(), patch)
  if (!result.ok) throw result.error
  cached = result.config
  store().set(result.config as unknown as Record<string, unknown>)
  return result.config
}

/** Test seam: drops the cache and handle so the next call reads the disk again. */
export function resetConfigCacheForTests(): void {
  cached = null
  raw = null
}

export { defaultConfig }
