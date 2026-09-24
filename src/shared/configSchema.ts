import { z } from 'zod'
import { THEME_NAMES, DEFAULT_FONT_STEP, FONT_STEP_COUNT } from './theme'

/**
 * Versioned config schema. Bumping CURRENT_SCHEMA_VERSION and adding a new
 * shape here goes hand-in-hand with adding a migration file under
 * src/main/config/migrations/ - see runner.ts for how the two connect.
 */
export const CURRENT_SCHEMA_VERSION = 1

export const tileSchema = z.object({
  id: z.string(),
  type: z.enum(['web', 'app', 'builtin']),
  label: z.string(),
  icon: z.string().optional(),
  url: z.string().optional(),
  appPath: z.string().optional(),
  builtinKey: z.string().optional()
})

export const weatherConfigSchema = z.object({
  locations: z.array(
    z.object({
      id: z.string(),
      /** Free-text place name, geocoded (and cached) at fetch time - same UX as the old app. */
      label: z.string()
    })
  ),
  units: z.enum(['imperial', 'metric']).default('imperial')
})

export const confusionConfigSchema = z.object({
  inactivityTimeoutMinutes: z.number().min(1).max(60).default(3),
  rapidTap: z.object({
    count: z.number().min(3).max(50).default(20),
    windowMs: z.number().min(500).max(10000).default(4000),
    clusterRadiusPx: z.number().min(20).max(400).default(80),
    cooldownMs: z.number().min(1000).max(60000).default(15000)
  })
})

export const buddyConfigSchema = z.object({
  anthropicApiKey: z.string().optional(),
  model: z.string().default('claude-haiku-4-5-20251001'),
  chattiness: z.enum(['off', 'low', 'normal']).default('off'),
  cloudTtsEnabled: z.boolean().default(true)
})

export const displayConfigSchema = z.object({
  /** Index into shared/theme.ts's FONT_STEPS, not a raw scale - matches the
   *  on-screen A-/A+ control's discrete 5-step model exactly. */
  fontStep: z.number().int().min(0).max(FONT_STEP_COUNT - 1).default(DEFAULT_FONT_STEP),
  theme: z.enum(THEME_NAMES).default('tilesBold'),
  ambientBackground: z.boolean().default(true),
  volumeCeiling: z.number().min(0).max(100).default(70)
})

export const reliabilityConfigSchema = z.object({
  wifiAdapterName: z.string().optional(),
  adminPinHash: z.string().optional(),
  adminPinSalt: z.string().optional()
})

export const configSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  tiles: z.array(tileSchema).default([]),
  weather: weatherConfigSchema,
  confusion: confusionConfigSchema,
  buddy: buddyConfigSchema,
  display: displayConfigSchema,
  reliability: reliabilityConfigSchema
})

export type Config = z.infer<typeof configSchema>
export type Tile = z.infer<typeof tileSchema>

/**
 * Never sent to any renderer as-is - secrets (the Anthropic API key, PIN
 * hash+salt) are stripped. Matches the old app's security model: the
 * caregiver can *set* the API key/PIN but the app never reads it back to
 * any renderer afterward.
 */
export type PublicConfig = Omit<Config, 'buddy' | 'reliability'> & {
  buddy: Omit<Config['buddy'], 'anthropicApiKey'>
  reliability: Omit<Config['reliability'], 'adminPinHash' | 'adminPinSalt'>
}

export function toPublicConfig(cfg: Config): PublicConfig {
  const { anthropicApiKey: _key, ...publicBuddy } = cfg.buddy
  const { adminPinHash: _hash, adminPinSalt: _salt, ...publicReliability } = cfg.reliability
  return { ...cfg, buddy: publicBuddy, reliability: publicReliability }
}

export function defaultConfig(): Config {
  return configSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tiles: [],
    weather: { locations: [], units: 'imperial' },
    confusion: {
      inactivityTimeoutMinutes: 3,
      rapidTap: { count: 20, windowMs: 4000, clusterRadiusPx: 80, cooldownMs: 15000 }
    },
    buddy: { model: 'claude-haiku-4-5-20251001', chattiness: 'off', cloudTtsEnabled: true },
    display: { fontStep: DEFAULT_FONT_STEP, theme: 'tilesBold', ambientBackground: true, volumeCeiling: 70 },
    reliability: {}
  })
}
