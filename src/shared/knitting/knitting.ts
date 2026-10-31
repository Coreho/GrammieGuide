import { z } from 'zod'

export const MAX_KNITTING_ROWS = 9999
/**
 * A second tap the same way this soon is a double tap, not another row: a row
 * takes her minutes, and a counter that jumps by two loses her place, which is
 * the thing it exists to keep. Tapping the other way (a correction) is never held back.
 */
export const KNITTING_REPEAT_GUARD_MS = 1500
export const MAX_KNITTING_PATTERNS = 20
export const MAX_PATTERN_PAGES = 60
/** Pages keep more detail than photos (1600): pattern text and charts must stay sharp at full screen. */
export const PATTERN_PAGE_EDGE = 2400
export const MAX_KNITTING_PIECES = 100
/** A finished piece is a photo like her family photos, so it is kept at their size. */
export const PIECE_PICTURE_EDGE = 1600
/** Fixed here: the caregiver only switches it on, and Home never gets to choose an address. */
export const RAVELRY_URL = 'https://www.ravelry.com/'

const patternName = z.string().trim().min(1, 'Give the pattern a name.').max(40)
export const patternNameSchema = patternName

export const knittingPieceInputSchema = z.object({
  what: z.string().trim().min(1, 'Say what the piece is.').max(40),
  forWhom: z.string().trim().max(40).default('')
})
export type KnittingPieceInput = z.input<typeof knittingPieceInputSchema>

export const knittingProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Say what she is making.').max(40),
  forWhom: z.string().trim().max(40).default(''),
  photoId: z.string().uuid().optional(),
  /** A saved pattern she can open from her project; unknown IDs are dropped. */
  patternId: z.string().uuid().optional(),
  /** True starts over at row 0; false keeps her count while the caregiver edits the details. */
  startNew: z.boolean().default(false)
})
export type KnittingProjectInput = z.input<typeof knittingProjectInputSchema>

export const knittingProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  forWhom: z.string().trim().max(40),
  photoId: z.string().uuid().optional(),
  patternId: z.string().uuid().optional(),
  rows: z.number().int().min(0).max(MAX_KNITTING_ROWS),
  lastChange: z
    .object({ direction: z.enum(['add', 'remove']), at: z.number().int().nonnegative() })
    .optional()
})
export type KnittingProject = z.infer<typeof knittingProjectSchema>

export const knittingPatternSchema = z.object({
  id: z.string().uuid(),
  name: patternName,
  /** Library entry IDs in page order; the pictures live in the patterns media library. */
  pages: z.array(z.string().uuid()).min(1).max(MAX_PATTERN_PAGES),
  /** The page she was on, so the pattern reopens where she left it. */
  lastPage: z.number().int().min(0).default(0)
})
export type KnittingPattern = z.infer<typeof knittingPatternSchema>

/** One finished piece in her gallery. */
export const knittingPieceSchema = z.object({
  id: z.string().uuid(),
  what: z.string().trim().min(1).max(40),
  forWhom: z.string().trim().max(40),
  /** Library entry ID; the photo lives in the knitted media library. */
  picture: z.string().uuid()
})
export type KnittingPiece = z.infer<typeof knittingPieceSchema>

export const knittingFileSchema = z.object({
  version: z.literal(1),
  project: knittingProjectSchema.nullable(),
  // Added with patterns and then pieces; a file from before them simply has none.
  patterns: z.array(knittingPatternSchema).max(MAX_KNITTING_PATTERNS).default([]),
  /** Her finished work, newest first unless the caregiver reorders it. */
  pieces: z.array(knittingPieceSchema).max(MAX_KNITTING_PIECES).default([])
})
export type KnittingFile = z.infer<typeof knittingFileSchema>

export type RowDirection = 'add' | 'remove'

/** One pattern as Home shows it. A page with no url has lost its picture. */
export interface HomePattern {
  id: string
  name: string
  lastPage: number
  thumbnailUrl?: string
  pages: { url?: string }[]
}

/** One finished piece as Home shows it. A piece with no url has lost its photo. */
export interface HomePiece {
  id: string
  what: string
  forWhom: string
  url?: string
  thumbnailUrl?: string
}

/** What Home is told: what she sees, plus pattern IDs to remember her page by. */
export interface HomeKnitting {
  project: {
    name: string
    forWhom: string
    rows: number
    photoUrl?: string
    thumbnailUrl?: string
    patternId?: string
  } | null
  patterns: HomePattern[]
  pieces: HomePiece[]
}

/** What the caregiver's Knitting tab edits. */
export interface AdminKnitting {
  project: Pick<KnittingProject, 'name' | 'forWhom' | 'photoId' | 'patternId' | 'rows'> | null
  patterns: { id: string; name: string; pageCount: number; thumbnailUrl?: string }[]
  pieces: { id: string; what: string; forWhom: string; thumbnailUrl?: string }[]
}

export interface PatternImportResult {
  knitting: AdminKnitting
  /** Pages added; 0 when the caregiver cancelled the picker. */
  added: number
  /** Pages that couldn't be read; never their file names. */
  failed: number
}

export interface PieceImportResult {
  knitting: AdminKnitting
  /** False when the caregiver cancelled the picker. */
  added: boolean
}

export type PieceMove = 'earlier' | 'later'

/** Moves one piece a place earlier or later; returns the same array when it can't move. */
export function movePiece<T extends { id: string }>(
  pieces: T[],
  id: string,
  direction: PieceMove
): T[] {
  const from = pieces.findIndex((piece) => piece.id === id)
  const to = direction === 'earlier' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= pieces.length) return pieces
  const moved = [...pieces]
  ;[moved[from], moved[to]] = [moved[to]!, moved[from]!]
  return moved
}

/** Files picked together are pages in name order, so page2 comes before page10. */
export function orderPagePaths(paths: readonly string[]): string[] {
  const base = (path: string): string => path.split(/[\\/]/).at(-1) ?? path
  return [...paths].sort((a, b) =>
    base(a).localeCompare(base(b), undefined, { numeric: true, sensitivity: 'base' })
  )
}

/** Clamps a remembered page to the pattern as it is now (pages can be fewer than before). */
export function pageToOpen(pattern: Pick<HomePattern, 'lastPage' | 'pages'>): number {
  return Math.min(Math.max(0, pattern.lastPage), Math.max(0, pattern.pages.length - 1))
}

/** Applies one tap; returns the same object when the tap changes nothing. */
export function changeRows(
  project: KnittingProject,
  direction: RowDirection,
  now: number
): KnittingProject {
  const last = project.lastChange
  if (
    last &&
    last.direction === direction &&
    now >= last.at &&
    now - last.at < KNITTING_REPEAT_GUARD_MS
  ) {
    return project
  }
  const rows = Math.min(
    MAX_KNITTING_ROWS,
    Math.max(0, project.rows + (direction === 'add' ? 1 : -1))
  )
  if (rows === project.rows) return project
  return { ...project, rows, lastChange: { direction, at: now } }
}
