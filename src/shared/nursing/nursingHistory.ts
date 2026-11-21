import { z } from 'zod'
import { isSafeMediaFileName } from '../media/mediaPath'
import type { LibraryEntry } from '../media/libraryTypes'

/**
 * Her nursing career as she sees it on the Nursing History tile: chapters of her working
 * life, each with a short story and the papers she kept from that time. The words and the
 * page pictures are hers and personal (some papers carry private details), so they live only
 * in userData (nursing/history.json and the `nursing` media library), never in config, logs
 * or this repository.
 */

export const MAX_NURSING_CHAPTERS = 20
export const MAX_NURSING_PAPERS = 40
export const MAX_NURSING_PAGES = 120
/** Page pictures keep text readable, like knitting pattern pages. */
export const NURSING_PAGE_EDGE = 2400

const uuid = z.string().uuid()
const line = (max: number): z.ZodString => z.string().trim().min(1).max(max)

export const nursingPaperSchema = z.object({
  id: uuid,
  title: line(120),
  /** One short line under the title: "Her own paper" / "For her students". */
  note: z.string().trim().max(200).default(''),
  /** Entry IDs in the nursing media library, in page order. */
  pages: z.array(uuid).min(1).max(MAX_NURSING_PAGES)
})

export const nursingChapterSchema = z.object({
  id: uuid,
  title: line(80),
  /** Free text ("1960s", "2010 - 2012"): nobody should invent exact dates for her. */
  years: z.string().trim().max(40).default(''),
  story: z.string().trim().max(4000).default(''),
  papers: z.array(nursingPaperSchema).max(MAX_NURSING_PAPERS).default([])
})

export const nursingFileSchema = z.object({
  version: z.literal(1),
  chapters: z.array(nursingChapterSchema).max(MAX_NURSING_CHAPTERS)
})

export type NursingPaper = z.infer<typeof nursingPaperSchema>
export type NursingChapter = z.infer<typeof nursingChapterSchema>
export type NursingFile = z.infer<typeof nursingFileSchema>

export const EMPTY_NURSING_FILE: NursingFile = { version: 1, chapters: [] }

/** What Home receives: words and media URLs only; a page whose picture is gone is null. */
export interface HomeNursingPaper {
  id: string
  title: string
  note: string
  pages: (string | null)[]
}

export interface HomeNursingChapter {
  id: string
  title: string
  years: string
  story: string
  papers: HomeNursingPaper[]
}

export interface HomeNursing {
  chapters: HomeNursingChapter[]
}

/** Words and page URLs only. A page whose picture is gone is null, so Home can say so calmly. */
export function nursingForHome(file: NursingFile, entries: readonly LibraryEntry[]): HomeNursing {
  const files = new Map(entries.map((entry) => [entry.id, entry.fileName]))
  const url = (id: string): string | null => {
    const fileName = files.get(id)
    return fileName && isSafeMediaFileName(fileName) ? `grammie-media://nursing/${fileName}` : null
  }
  return {
    chapters: file.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      years: chapter.years,
      story: chapter.story,
      papers: chapter.papers.map((paper) => ({
        id: paper.id,
        title: paper.title,
        note: paper.note,
        pages: paper.pages.map(url)
      }))
    }))
  }
}

/** How she reads a paper's page count: "1 page", "12 pages". */
export function pageCount(count: number): string {
  return count === 1 ? '1 page' : `${count} pages`
}
