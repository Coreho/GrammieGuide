import { z } from 'zod'
import type { Tile } from '../configSchema'
import { httpUrl } from './httpUrl'

export const newsSourceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(40),
  url: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (!httpUrl(value)) return false
      const url = new URL(value)
      return !url.username && !url.password
    }, 'Enter a complete http(s) website address without a username or password.')
})

export type NewsSource = z.infer<typeof newsSourceSchema>
export type NewsPreview = { image?: string; capturedAt?: number }

export const DEFAULT_NEWS_SOURCES: readonly NewsSource[] = [
  { id: 'yahoo', label: 'Yahoo News', url: 'https://www.yahoo.com/news/' },
  { id: 'bbc', label: 'BBC News', url: 'https://www.bbc.com/news' },
  { id: 'nbc', label: 'NBC News', url: 'https://www.nbcnews.com/' }
]

export function newsSourceFor(tile: Tile | undefined, sourceId: string): NewsSource | undefined {
  return tile?.type === 'builtin' && tile.builtinKey === 'news'
    ? tile.newsSources?.find((source) => source.id === sourceId)
    : undefined
}
