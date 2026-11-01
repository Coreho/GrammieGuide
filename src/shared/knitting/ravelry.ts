import { z } from 'zod'

/** Enough to choose from without turning her shelf into Ravelry itself. */
export const MAX_RAVELRY_PATTERNS = 24
export const MAX_RAVELRY_PICTURES = 6
export const MAX_RAVELRY_RESULTS = 12
/** Ravelry's largest listed photo is 640 pixels, so this only ever bounds an unexpected size. */
export const RAVELRY_PICTURE_EDGE = 1600
const MAX_NAME = 120
const MAX_DESIGNER = 80
const MAX_FACT = 240
const MAX_NOTES = 3000
/** Matches MAX_PATTERN_PAGES, so her saved instructions fit the same page viewer. */
const RAVELRY_MAX_PAGES = 60

/**
 * What she can browse. Fixed here so nothing she does can make up a search. `pc` values were
 * checked against the real API on 2026-11-01. Ravelry's mature content category is not offered.
 */
export const RAVELRY_CATEGORIES = [
  { id: 'blankets', label: 'Blankets', pc: 'blanket' },
  { id: 'scarves', label: 'Scarves', pc: 'scarf' },
  { id: 'hats', label: 'Hats', pc: 'hat' },
  { id: 'sweaters', label: 'Sweaters', pc: 'pullover' },
  { id: 'cardigans', label: 'Cardigans', pc: 'cardigan' },
  { id: 'socks', label: 'Socks', pc: 'socks' },
  { id: 'mittens', label: 'Mittens', pc: 'mittens' },
  { id: 'toys', label: 'Toys', pc: 'softies' }
] as const

/** A pattern as saved for her: a plain-text copy, so Home never needs Ravelry to show it. */
export const ravelryPatternSchema = z.object({
  id: z.string().uuid(),
  ravelryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(MAX_NAME),
  designer: z.string().trim().max(MAX_DESIGNER),
  facts: z.array(z.object({ label: z.string(), value: z.string().max(MAX_FACT) })).max(5),
  notes: z.string().max(MAX_NOTES),
  /** Library entry IDs; the pictures live in the ravelry media library. */
  pictures: z.array(z.string().uuid()).max(MAX_RAVELRY_PICTURES),
  /** The name in its Ravelry address, so a pattern page can show it's already saved. */
  permalink: z.string().max(200).optional(),
  /** Page pictures of the instructions, when a free pattern's PDF could be saved. */
  pages: z.array(z.string().uuid()).max(RAVELRY_MAX_PAGES).default([]),
  lastPage: z.number().int().min(0).default(0)
})
export type RavelryPattern = z.infer<typeof ravelryPatternSchema>

export interface RavelryStatus {
  /** A read-only key is saved. The key itself never leaves main. */
  connected: boolean
  /** False when Windows can't encrypt, because the key is never saved in plain text. */
  canSave: boolean
}

export interface RavelrySearchResult {
  ravelryId: number
  name: string
  designer: string
  /** A data: URL fetched in main, so admin never loads anything from Ravelry itself. */
  thumbnailUrl?: string
}

/** What the API parsers keep from one search result. */
export interface RavelrySearchPattern {
  ravelryId: number
  name: string
  designer: string
  thumbnailSource?: string
  /** A larger picture, for the cards she browses. */
  pictureSource?: string
}

/** One pattern on a page she is browsing. Pictures are data: URLs fetched in main. */
export interface RavelryBrowseItem {
  ravelryId: number
  name: string
  designer: string
  thumbnailUrl?: string
}

export type RavelryCategoriesResult =
  { ok: true; categories: { id: string; label: string; thumbnailUrl?: string }[] } | { ok: false }

export type RavelryBrowseResult =
  { ok: true; items: RavelryBrowseItem[]; page: number; lastPage: number } | { ok: false }

export type RavelryPreviewResult =
  | {
      ok: true
      ravelryId: number
      name: string
      designer: string
      facts: { label: string; value: string }[]
      notes: string
      pictures: string[]
    }
  | { ok: false }

export type RavelrySaveResult =
  /** withInstructions: the pattern's own pages were saved, so she can read them here. */
  { ok: true; withInstructions: boolean } | { ok: false; reason: 'full' | 'unavailable' }

export interface RavelryPageState {
  savable: boolean
  saved: boolean
}

/** What the API parsers keep from one full pattern. */
export interface RavelryPatternDetails {
  ravelryId: number
  name: string
  designer: string
  facts: { label: string; value: string }[]
  notes: string
  pictureUrls: string[]
  permalink?: string
  /** Only for a free pattern. A paid pattern's address leads to a shop, not instructions. */
  instructionsUrl?: string
}

/** The pattern's name from a Ravelry pattern page's address, or null for any other page. */
export function parseRavelryPatternPage(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    if (!['ravelry.com', 'www.ravelry.com'].includes(parsed.hostname)) return null
    const match = parsed.pathname.match(/^\/patterns\/library\/([a-z0-9][a-z0-9-]{0,190})\/?$/i)
    return match ? match[1]! : null
  } catch {
    return null
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  times: '×'
}

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, code: string) => {
    if (!code.startsWith('#')) return NAMED_ENTITIES[code.toLowerCase()] ?? whole
    const point =
      code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : ''
  })
}

/** Control and invisible formatting characters out, line breaks kept, blank runs tidied. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(?!\n)[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Ends at a whole word where there is one, so a shortened line never stops mid-word. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const kept = text.slice(0, max - 1)
  const space = kept.lastIndexOf(' ')
  return `${(space > max / 2 ? kept.slice(0, space) : kept).trimEnd()}…`
}

/** Long notes stop at the end of a sentence or line: a thought cut off mid-word reads as a fault. */
function cutNotes(text: string): string {
  if (text.length <= MAX_NOTES) return text
  const kept = text.slice(0, MAX_NOTES)
  const end = Math.max(
    kept.lastIndexOf('. '),
    kept.lastIndexOf('! '),
    kept.lastIndexOf('? '),
    kept.lastIndexOf('\n')
  )
  return end >= MAX_NOTES / 2 ? kept.slice(0, end + 1).trimEnd() : cut(text, MAX_NOTES)
}

/**
 * Turns Ravelry's rendered notes into words. This is not a sanitizer and doesn't need
 * to be one: the result only ever reaches Home as a React text node, so anything that
 * survives shows as harmless text instead of running. Never render it as HTML.
 */
export function htmlToPlainText(html: string): string {
  return tidy(
    decodeEntities(
      html
        // Source line breaks mean nothing in HTML; only the tags below make new lines.
        .replace(/\s+/g, ' ')
        .replace(/<(script|style)\b.*?<\/\1\s*>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '\n• ')
        .replace(/<\/tr\s*>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|table)\s*>/gi, '\n\n')
        .replace(/<[^>]*>/g, '')
    )
  )
}

const line = (value: string | null | undefined, max: number): string =>
  cut(tidy(value ?? '').replace(/\n+/g, ' '), max)

const isHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

// Each optional field falls back alone, so one odd value costs that value and not the pattern.
const optionalText = z.string().nullish().catch(undefined)
const httpsUrl = z.string().refine(isHttps).nullish().catch(undefined)
const authorSchema = z.object({ name: optionalText }).nullish().catch(undefined)
const photoSchema = z.object({
  medium2_url: httpsUrl,
  medium_url: httpsUrl,
  small2_url: httpsUrl,
  small_url: httpsUrl
})
type ApiPhoto = z.infer<typeof photoSchema>
const baseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().refine((value) => line(value, MAX_NAME).length > 0),
  pattern_author: authorSchema,
  designer: authorSchema
})
const searchPatternSchema = baseSchema.extend({
  first_photo: photoSchema.nullish().catch(undefined)
})
const fullPatternSchema = baseSchema.extend({
  notes_html: optionalText,
  notes: optionalText,
  yarn_weight_description: optionalText,
  yardage_description: optionalText,
  sizes_available: optionalText,
  gauge_description: optionalText,
  // Documented as a string; clients describe a list of sizes, so either is accepted.
  pattern_needle_sizes: z
    .union([z.string(), z.array(z.object({ name: optionalText }))])
    .nullish()
    .catch(undefined),
  photos: z.array(photoSchema).nullish().catch(undefined),
  permalink: optionalText,
  free: z.boolean().nullish().catch(undefined),
  download_location: z.object({ url: optionalText }).nullish().catch(undefined)
})

const designerOf = (pattern: z.infer<typeof baseSchema>): string =>
  line(pattern.pattern_author?.name ?? pattern.designer?.name, MAX_DESIGNER)

/** Largest first: she sees these filling half the screen. */
const pictureOf = (photo: ApiPhoto): string | undefined =>
  photo.medium2_url ?? photo.medium_url ?? photo.small2_url ?? photo.small_url ?? undefined

/** A card's picture is about 400 pixels across, and the 640-pixel photos can pass the size cap. */
const cardPictureOf = (photo: ApiPhoto): string | undefined =>
  photo.medium_url ?? photo.small2_url ?? photo.small_url ?? photo.medium2_url ?? undefined

/** Smallest first: admin shows these as small thumbnails in a list. */
const thumbnailOf = (photo: ApiPhoto): string | undefined =>
  photo.small_url ?? photo.small2_url ?? photo.medium_url ?? photo.medium2_url ?? undefined

/** Null when the reply isn't a pattern list at all; a single bad entry is just skipped. */
export function parseRavelrySearch(data: unknown): RavelrySearchPattern[] | null {
  const envelope = z.object({ patterns: z.array(z.unknown()) }).safeParse(data)
  if (!envelope.success) return null
  return envelope.data.patterns.flatMap((raw) => {
    const parsed = searchPatternSchema.safeParse(raw)
    if (!parsed.success) return []
    const thumbnailSource = parsed.data.first_photo && thumbnailOf(parsed.data.first_photo)
    const pictureSource = parsed.data.first_photo && cardPictureOf(parsed.data.first_photo)
    return [
      {
        ravelryId: parsed.data.id,
        name: line(parsed.data.name, MAX_NAME),
        designer: designerOf(parsed.data),
        ...(thumbnailSource && { thumbnailSource }),
        ...(pictureSource && { pictureSource })
      }
    ]
  })
}

/** How many pages a browse has. A reply without a usable count is treated as one page. */
export function parseRavelryLastPage(data: unknown): number {
  const parsed = z
    .object({ paginator: z.object({ last_page: z.number().int().positive() }) })
    .safeParse(data)
  return parsed.success ? parsed.data.paginator.last_page : 1
}

/**
 * Ravelry lists its own download links as http, checked against real replies on 2026-11-01. They
 * are upgraded, because her browser's sign-in may go with them. A designer's own site may really
 * be http; that is only ever a file to read, sent nothing private and redrawn in a sandbox.
 */
function instructionsAddress(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (['ravelry.com', 'www.ravelry.com'].includes(parsed.hostname)) parsed.protocol = 'https:'
    return parsed.href
  } catch {
    return undefined
  }
}

function needlesOf(sizes: z.infer<typeof fullPatternSchema>['pattern_needle_sizes']): string {
  if (typeof sizes === 'string') return sizes
  return (sizes ?? []).flatMap((size) => (size.name ? [size.name] : [])).join(', ')
}

/** Null when the reply isn't a readable pattern; the caller keeps whatever it already has. */
export function parseRavelryPattern(data: unknown): RavelryPatternDetails | null {
  const parsed = z.object({ pattern: fullPatternSchema }).safeParse(data)
  if (!parsed.success) return null
  const { pattern } = parsed.data
  const facts = [
    { label: 'Yarn', value: pattern.yarn_weight_description },
    { label: 'Needles', value: needlesOf(pattern.pattern_needle_sizes) },
    { label: 'Yardage', value: pattern.yardage_description },
    { label: 'Sizes', value: pattern.sizes_available },
    { label: 'Gauge', value: pattern.gauge_description }
  ].flatMap(({ label, value }) => {
    const text = line(value, MAX_FACT)
    return text ? [{ label, value: text }] : []
  })
  const notes =
    pattern.notes_html != null ? htmlToPlainText(pattern.notes_html) : tidy(pattern.notes ?? '')
  const instructionsUrl = instructionsAddress(pattern.download_location?.url)
  return {
    ravelryId: pattern.id,
    name: line(pattern.name, MAX_NAME),
    designer: designerOf(pattern),
    facts,
    notes: cutNotes(notes),
    pictureUrls: (pattern.photos ?? [])
      .flatMap((photo) => {
        const url = pictureOf(photo)
        return url ? [url] : []
      })
      .slice(0, MAX_RAVELRY_PICTURES),
    ...(pattern.permalink && { permalink: pattern.permalink }),
    ...(pattern.free === true && instructionsUrl && { instructionsUrl })
  }
}
