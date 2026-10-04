import { configSchema, type Config } from '@shared/configSchema'

/**
 * Every config write is validated here, before the cache or the disk changes.
 *
 * Without this, one bad value costs her everything: the next boot fails
 * `runMigrations`' validation, falls back to `defaultConfig()`, and wipes her
 * tiles, the Anthropic key and the PIN hash - after which `admin:setPin` accepts
 * a new PIN from anyone standing at the kiosk. No current admin path writes an
 * invalid value (the inputs are bounded sliders and full nested objects), so this
 * is defense in depth against a renderer bug, a future form, or devtools.
 *
 * Pure and Electron-free on purpose: no `app`, no `Store`, no clock, so it can be
 * tested directly and reasoned about without a running app.
 */

/**
 * Thrown for a patch that would not validate. Carries only the failing field
 * *paths* - never a value - because this message can reach the activity log, and
 * `display` is not the only place a secret could sit in a future schema.
 */
export class ConfigValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super('That change could not be saved. Please check the settings and try again.')
    this.name = 'ConfigValidationError'
    this.issues = issues
  }
}

export type ConfigPatchResult =
  { ok: true; config: Config } | { ok: false; error: ConfigValidationError }

/**
 * One-level merge, then full schema validation. The merge stays one level deep to
 * match how `setConfig` has always behaved: a patch replaces a whole section, and
 * sections it does not mention are carried over untouched.
 *
 * The *parsed* result is what should be saved, so unknown keys are dropped and
 * defaults are filled in on the way to disk rather than accumulating in the file.
 */
export function applyConfigPatch(current: Config, patch: Partial<Config>): ConfigPatchResult {
  const parsed = configSchema.safeParse({ ...current, ...patch })
  if (!parsed.success) {
    return {
      ok: false,
      error: new ConfigValidationError(
        parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      )
    }
  }
  return { ok: true, config: parsed.data }
}
