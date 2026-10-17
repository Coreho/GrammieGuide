import { z } from 'zod'
import { TILE_COLOR_COUNT } from '../tileColors'

export const BUILTIN_GAME_KEYS = ['matching', 'puzzle', 'tictactoe', 'melody'] as const
export type BuiltinGameKey = (typeof BUILTIN_GAME_KEYS)[number]

export const BUILTIN_GAME_LABELS: Record<BuiltinGameKey, string> = {
  matching: 'Matching Pairs',
  puzzle: 'Picture Puzzle',
  tictactoe: 'Tic-Tac-Toe',
  melody: 'Melody Chimes'
}

export const BUILTIN_GAME_DESCRIPTIONS: Record<BuiltinGameKey, string> = {
  matching: 'Turn over large cards two at a time to find matching pictures.',
  puzzle: 'Tap two pieces to swap them until the picture comes together.',
  tictactoe: 'Take turns placing suns and blossoms on a friendly three-by-three board.',
  melody: 'Tap the colored pads to play gentle chime notes or follow a glowing tune.'
}

const windowsPathPattern = /^(?:[a-z]:\\|\\\\)/i

export const installedGameSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(28),
  appPath: z
    .string()
    .trim()
    .min(1)
    .max(520)
    .refine((val) => windowsPathPattern.test(val), {
      message: 'Must be a full Windows path'
    }),
  colorIndex: z
    .number()
    .int()
    .min(0)
    .max(TILE_COLOR_COUNT - 1)
    .default(0)
})

export const gamesConfigSchema = z.object({
  enabledBuiltins: z
    .array(z.enum(BUILTIN_GAME_KEYS))
    .default([...BUILTIN_GAME_KEYS])
    .transform((keys) => [...new Set(keys)]),
  useFamilyPhotos: z.boolean().default(true),
  installedGames: z.array(installedGameSchema).max(12).default([])
})

export type InstalledGame = z.infer<typeof installedGameSchema>
export type GamesConfig = z.infer<typeof gamesConfigSchema>

export function defaultGamesConfig(): GamesConfig {
  return {
    enabledBuiltins: [...BUILTIN_GAME_KEYS],
    useFamilyPhotos: true,
    installedGames: []
  }
}
