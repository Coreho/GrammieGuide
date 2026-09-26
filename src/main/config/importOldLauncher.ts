import { readFileSync } from 'fs'
import { join } from 'path'
import { configSchema, type Config } from '@shared/configSchema'
import { FONT_STEPS } from '@shared/theme'
import type { OldLauncherImportPreview } from '@shared/ipcContract'

/**
 * One-time carry-over of *settings* from grandmas-launcher on the same
 * machine: text size, weather location and units, volume limit, and the
 * confusion timings - the things tuned to her over time. Reads the old app's
 * electron-store file (%APPDATA%\grandmas-launcher\config.json) and never
 * writes to it; the old app stays intact as the fallback.
 *
 * Tiles are deliberately not imported: Home's tiles are set up fresh in
 * GrammieGuide rather than copied across. Also not imported: the admin PIN
 * (different hashing, and the caregiver should set one knowingly) and the AI
 * key (the old app's was an OpenRouter key, which doesn't work here).
 */

export function oldLauncherConfigPath(appDataDir: string): string {
  return join(appDataDir, 'grandmas-launcher', 'config.json')
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)))

// The old launcher's CSS classes (index.css .font-small ... .font-xlarge).
const OLD_FONT_SCALES: Record<string, number> = { small: 0.9, medium: 1, large: 1.15, xlarge: 1.35 }

function nearestFontStep(scale: number): number {
  let best = 0
  FONT_STEPS.forEach((s, i) => {
    if (Math.abs(s - scale) < Math.abs(FONT_STEPS[best]! - scale)) best = i
  })
  return best
}

export type ImportPlan = {
  preview: Extract<OldLauncherImportPreview, { found: true }>
  patch: Pick<Config, 'weather' | 'display' | 'confusion'>
}

export function planOldLauncherImport(old: unknown, current: Config): ImportPlan {
  const o = isObj(old) ? old : {}
  const settings: string[] = []

  const weather = { ...current.weather }
  if (isObj(o.weather)) {
    const w = o.weather
    const oldLabels = [
      ...(Array.isArray(w.locations) ? w.locations.map((l) => (isObj(l) ? str(l.label) ?? str(l.name) : str(l))) : []),
      str(w.location)
    ].filter((l): l is string => Boolean(l))
    if (weather.locations.length === 0 && oldLabels[0]) {
      weather.locations = [{ id: crypto.randomUUID(), label: oldLabels[0] }]
      settings.push(`Weather location: ${oldLabels[0]}`)
    }
    const unit = str(w.unit)
    if (unit === 'F' || unit === 'C') {
      weather.units = unit === 'F' ? 'imperial' : 'metric'
      settings.push(`Temperatures in °${unit}`)
    }
  }

  const display = { ...current.display }
  if (isObj(o.display)) {
    const d = o.display
    const scale = OLD_FONT_SCALES[str(d.fontScale) ?? '']
    if (scale !== undefined) {
      display.fontStep = nearestFontStep(scale)
      settings.push(`Text size: ${str(d.fontScale)} (step ${display.fontStep + 1} of ${FONT_STEPS.length})`)
    }
    const volume = num(d.volumeLevel)
    if (volume !== undefined) {
      // The old app held the volume *at* this level; here it's the most it may be.
      display.volumeCeiling = clamp(volume, 0, 100)
      settings.push(`Volume limit: ${display.volumeCeiling}%`)
    }
    if (typeof d.ambientBackground === 'boolean') display.ambientBackground = d.ambientBackground
  }

  const confusion = { ...current.confusion, rapidTap: { ...current.confusion.rapidTap } }
  if (isObj(o.confusion)) {
    const c = o.confusion
    const minutes = num(c.inactivityMinutes)
    if (minutes !== undefined) {
      confusion.inactivityTimeoutMinutes = clamp(minutes, 1, 60)
      settings.push(`Websites close after ${confusion.inactivityTimeoutMinutes} idle minutes`)
    }
    const count = num(c.rapidTapCount)
    const windowMs = num(c.rapidTapWindowMs)
    if (count !== undefined) confusion.rapidTap.count = clamp(count, 3, 50)
    if (windowMs !== undefined) confusion.rapidTap.windowMs = clamp(windowMs, 500, 10_000)
    if (count !== undefined || windowMs !== undefined) {
      settings.push(`Rapid-tap help: ${confusion.rapidTap.count} taps in ${confusion.rapidTap.windowMs / 1000}s`)
    }
  }

  // Belt and braces: whatever the old file held, the result must be a valid config.
  const patch = configSchema.pick({ weather: true, display: true, confusion: true }).parse({ weather, display, confusion })

  return {
    preview: {
      found: true,
      settings,
      notImported: [
        'Tiles (set up fresh below)',
        'Admin PIN (set a new one here)',
        'AI key (the old one was for a different service)'
      ]
    },
    patch
  }
}

export function readOldLauncherConfig(appDataDir: string): unknown | null {
  try {
    return JSON.parse(readFileSync(oldLauncherConfigPath(appDataDir), 'utf8')) as unknown
  } catch {
    return null
  }
}
