import { z } from 'zod'
import { BACKGROUND_NAMES, THEME_NAMES, DEFAULT_FONT_STEP, FONT_STEP_COUNT } from './theme'
import { TILE_COLOR_COUNT } from './tileColors'
import { quickMessageSchema } from './buddy/commands'
import { BUDDY_PROVIDERS, DEFAULT_BUDDY_PROVIDER } from './buddy/providers'
import { HOME_LAYOUT_NAMES } from './homeLayout'
import { musicSettingsSchema } from './music/musicSchema'
import { TILE_ARTWORK_KEYS } from './tileArtwork'
import { MAX_APPROVED_SITES, siteFor } from './browser/approvedSites'
import { defaultGamesConfig, gamesConfigSchema } from './games/gamesSchema'
import { newsSourceSchema } from './news/sources'
import { personalFactsSchema } from './buddy/personalFacts'
import {
  contactConfigSchema,
  defaultContactSetup,
  publicContacts,
  type PublicContacts
} from './contactSettings'

/**
 * Versioned config schema. Bumping CURRENT_SCHEMA_VERSION and adding a new
 * shape here goes hand-in-hand with adding a migration file under
 * src/main/config/migrations/ - see runner.ts for how the two connect.
 */
export const CURRENT_SCHEMA_VERSION = 20

// Offer only built-ins with working launcher views. Future features add their keys here.
export const BUILTIN_TILE_KEYS = ['weather', 'news', 'photos', 'music', 'games'] as const

export const tileSchema = z.object({
  id: z.string(),
  type: z.enum(['web', 'app', 'builtin']),
  label: z.string(),
  size: z.enum(['normal', 'wide']).default('normal'),
  /** Permanent position in the selected Home layout. Null keeps overflow configured but hidden. */
  slot: z.number().int().min(0).max(7).nullable().default(null),
  // Store the palette slot so theme changes keep the caregiver's selection.
  colorIndex: z
    .number()
    .int()
    .min(0)
    .max(TILE_COLOR_COUNT - 1),
  icon: z.string().optional(),
  /** Named bundled artwork only. This never changes what the tile opens. */
  artwork: z.enum(TILE_ARTWORK_KEYS).optional(),
  /** Managed photo ID only; paths and image URLs never enter tile configuration. */
  photoId: z.string().uuid().optional(),
  url: z.string().optional(),
  /** Optional so existing tiles keep their version-4 shape; News validates it before fetching. */
  feedUrl: z.string().optional(),
  /** Website shelf when present; absence preserves an existing single-feed tile. */
  newsSources: z
    .array(newsSourceSchema)
    .min(1)
    .max(6)
    .refine(
      (sources) => new Set(sources.map((source) => source.id)).size === sources.length,
      'Each news source needs a unique ID.'
    )
    .optional(),
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
  provider: z.enum(BUDDY_PROVIDERS).default(DEFAULT_BUDDY_PROVIDER),
  /** Chat can be switched off while Buddy's presence and friendly reactions stay available. */
  chatEnabled: z.boolean().default(true),
  /** Discovered and verified against the signed-in ChatGPT account. */
  model: z.string().default(''),
  chattiness: z.enum(['off', 'low', 'normal']).default('off'),
  /** Online Edge voice for speech; off (or offline) falls back to the Windows voice. */
  cloudTtsEnabled: z.boolean().default(true),
  /** Read chat replies and tap reactions aloud. Unprompted remarks stay silent either way. */
  voiceEnabled: z.boolean().default(true),
  /** Edge neural voice name. Aria is what the old app spoke with, so she already knows it. */
  ttsVoice: z.string().default('en-US-AriaNeural'),
  /** Caregivers choose how much movement helps her, rather than assuming more is better. */
  motion: z.enum(['still', 'roam', 'reduced']).default('roam'),
  tapAction: z.enum(['reaction', 'chat']).default('reaction'),
  quickMessages: z.array(quickMessageSchema).max(50).default([]),
  personalFacts: personalFactsSchema.default([])
})

export const idleDimConfigSchema = z.object({
  enabled: z.boolean().default(false),
  afterMinutes: z.number().int().min(2).max(60).default(10),
  level: z.number().min(0.1).max(0.5).default(0.3)
})
export type IdleDimConfig = z.infer<typeof idleDimConfigSchema>

export const displayConfigSchema = z.object({
  /** Index into shared/theme.ts's FONT_STEPS, not a raw scale - matches the
   *  on-screen A-/A+ control's discrete 5-step model exactly. */
  fontStep: z
    .number()
    .int()
    .min(0)
    .max(FONT_STEP_COUNT - 1)
    .default(DEFAULT_FONT_STEP),
  theme: z.enum(THEME_NAMES).default('tilesBold'),
  // Unset is the theme's own background, so existing setups need no migration.
  // An unknown name (from a newer or older build) is dropped rather than failing
  // the whole config at boot and resetting her Home.
  background: z.enum(BACKGROUND_NAMES).optional().catch(undefined),
  homeLayout: z.enum(HOME_LAYOUT_NAMES).default('simple4'),
  ambientBackground: z.boolean().default(true),
  volumeCeiling: z.number().min(0).max(100).default(70),
  idleDim: idleDimConfigSchema.default({
    enabled: false,
    afterMinutes: 10,
    level: 0.3
  })
})

export const reliabilityConfigSchema = z.object({
  wifiAdapterName: z.string().optional(),
  adminPinHash: z.string().optional(),
  adminPinSalt: z.string().optional()
})

export const configSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  // Lenient on purpose: an entry the site rule no longer accepts (say a newly
  // listed shared ending) is dropped, never a reason to fail the whole config
  // at boot and reset her Home to defaults. Admin's Sites tab rejects bad input
  // with a message before it gets here.
  approvedSites: z
    .array(z.string())
    .default([])
    .transform((sites) =>
      [...new Set(sites.flatMap((site) => siteFor(site.toLowerCase()) ?? []))].slice(
        0,
        MAX_APPROVED_SITES
      )
    ),
  tiles: z.array(tileSchema).default([]),
  weather: weatherConfigSchema,
  confusion: confusionConfigSchema,
  buddy: buddyConfigSchema,
  photos: z
    .object({ slideshowEnabled: z.boolean().default(false) })
    .default({ slideshowEnabled: false }),
  music: musicSettingsSchema.default({
    playlists: [],
    autoStopMinutes: 90,
    showNowPlayingChip: true
  }),
  games: gamesConfigSchema.default(defaultGamesConfig()),
  display: displayConfigSchema,
  reliability: reliabilityConfigSchema,
  contacts: contactConfigSchema.default(defaultContactSetup())
})

export type Config = z.infer<typeof configSchema>
export type Tile = z.infer<typeof tileSchema>

/** PIN and contact secrets stay private; ChatGPT tokens live outside config. */
export type PublicConfig = Omit<Config, 'buddy' | 'reliability' | 'contacts'> & {
  contacts: PublicContacts
  buddy: Config['buddy']
  reliability: Omit<Config['reliability'], 'adminPinHash' | 'adminPinSalt'>
}

export function toPublicConfig(cfg: Config): PublicConfig {
  const publicBuddy = buddyConfigSchema.parse(cfg.buddy)
  const { adminPinHash: _hash, adminPinSalt: _salt, ...publicReliability } = cfg.reliability
  return {
    ...cfg,
    buddy: publicBuddy,
    reliability: publicReliability,
    contacts: publicContacts(cfg.contacts)
  }
}

/** Preserve device PIN/contact secrets and strip obsolete Buddy credential fields. */
export function mergeAdminPatch(
  current: Config,
  patch: Partial<Config> | Partial<PublicConfig>
): Partial<Config> {
  const { contacts: _contactPatch, ...rest } = patch
  const merged: Partial<Config> = { ...rest }
  // Contact setup has its own gated writer. In particular a settings restore
  // must never relabel a preserved phone number with an imported person's name.
  if ('contacts' in patch) merged.contacts = current.contacts
  if (patch.buddy) merged.buddy = buddyConfigSchema.parse(patch.buddy)
  if (patch.reliability) {
    merged.reliability = {
      ...patch.reliability,
      adminPinHash: current.reliability.adminPinHash,
      adminPinSalt: current.reliability.adminPinSalt
    }
  }
  return merged
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
    buddy: {
      model: '',
      chattiness: 'off',
      cloudTtsEnabled: true,
      voiceEnabled: true,
      ttsVoice: 'en-US-AriaNeural',
      motion: 'roam',
      tapAction: 'reaction'
    },
    games: defaultGamesConfig(),
    display: {
      fontStep: DEFAULT_FONT_STEP,
      theme: 'tilesBold',
      homeLayout: 'simple4',
      ambientBackground: true,
      volumeCeiling: 70,
      idleDim: {
        enabled: false,
        afterMinutes: 10,
        level: 0.3
      }
    },
    reliability: {}
  })
}
