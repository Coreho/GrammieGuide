import Store from 'electron-store'
import { app } from 'electron'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Config } from '@shared/configSchema'
import { runMigrations } from './migrations/runner'

const raw = new Store<Record<string, unknown>>({ name: 'grammieguide-config' })

function backupCorrupt(value: unknown): void {
  try {
    const dir = app.getPath('userData')
    const path = join(dir, `config.corrupt-${Date.now()}.json`)
    if (!existsSync(dir)) return
    writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
  } catch {
    // Backing up the corrupt file is best-effort; never let it block boot.
  }
}

let cached: Config | null = null

export function loadConfig(): Config {
  if (cached) return cached
  const result = runMigrations(raw.store)
  if (!result.ok) {
    backupCorrupt(result.corruptBackup)
  }
  cached = result.config
  raw.set(cached as unknown as Record<string, unknown>)
  return cached
}

export function getConfig(): Config {
  return cached ?? loadConfig()
}

export function setConfig(patch: Partial<Config>): Config {
  const next = { ...getConfig(), ...patch }
  cached = next
  raw.set(next as unknown as Record<string, unknown>)
  return next
}
