import { z } from 'zod'

export const playlistSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  shuffle: z.boolean().default(false),
  trackIds: z
    .array(z.string().uuid())
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'A track can appear once in a playlist')
})

export const musicSettingsSchema = z.object({
  playlists: z
    .array(playlistSchema)
    .max(6)
    .default([])
    .refine(
      (lists) => new Set(lists.map((list) => list.id)).size === lists.length,
      'Playlist IDs must be unique'
    ),
  autoStopMinutes: z.number().int().min(10).max(480).default(90),
  showNowPlayingChip: z.boolean().default(true)
})

export type MusicSettings = z.infer<typeof musicSettingsSchema>
export type MusicPlaylist = z.infer<typeof playlistSchema>
