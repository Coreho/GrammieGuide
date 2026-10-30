import { z } from 'zod'

export const MAX_KNITTING_ROWS = 9999
/**
 * A second tap the same way this soon is a double tap, not another row: a row
 * takes her minutes, and a counter that jumps by two loses her place, which is
 * the thing it exists to keep. Tapping the other way (a correction) is never held back.
 */
export const KNITTING_REPEAT_GUARD_MS = 1500

export const knittingProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Say what she is making.').max(40),
  forWhom: z.string().trim().max(40).default(''),
  photoId: z.string().uuid().optional(),
  /** True starts over at row 0; false keeps her count while the caregiver edits the details. */
  startNew: z.boolean().default(false)
})
export type KnittingProjectInput = z.input<typeof knittingProjectInputSchema>

export const knittingProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  forWhom: z.string().trim().max(40),
  photoId: z.string().uuid().optional(),
  rows: z.number().int().min(0).max(MAX_KNITTING_ROWS),
  lastChange: z
    .object({ direction: z.enum(['add', 'remove']), at: z.number().int().nonnegative() })
    .optional()
})
export type KnittingProject = z.infer<typeof knittingProjectSchema>

export const knittingFileSchema = z.object({
  version: z.literal(1),
  project: knittingProjectSchema.nullable()
})
export type KnittingFile = z.infer<typeof knittingFileSchema>

export type RowDirection = 'add' | 'remove'

/** What Home is told: no IDs it could replay, just what she sees. */
export interface HomeKnitting {
  project: {
    name: string
    forWhom: string
    rows: number
    photoUrl?: string
    thumbnailUrl?: string
  } | null
}

/** What the caregiver's Knitting tab edits. */
export interface AdminKnitting {
  project: Pick<KnittingProject, 'name' | 'forWhom' | 'photoId' | 'rows'> | null
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
