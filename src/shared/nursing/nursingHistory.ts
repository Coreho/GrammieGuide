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
export const NURSING_TITLE_MAX = 80
export const NURSING_YEARS_MAX = 40
export const NURSING_STORY_MAX = 4000
export const NURSING_PAPER_TITLE_MAX = 120
export const NURSING_NOTE_MAX = 200

const uuid = z.string().uuid()
const line = (max: number): z.ZodString => z.string().trim().min(1).max(max)

export const nursingPaperSchema = z.object({
  id: uuid,
  title: line(NURSING_PAPER_TITLE_MAX),
  /** One short line under the title: "Her own paper" / "For her students". */
  note: z.string().trim().max(NURSING_NOTE_MAX).default(''),
  /** Entry IDs in the nursing media library, in page order. */
  pages: z.array(uuid).min(1).max(MAX_NURSING_PAGES)
})

export const nursingChapterSchema = z.object({
  id: uuid,
  title: line(NURSING_TITLE_MAX),
  /** Free text ("1960s", "2010 - 2012"): nobody should invent exact dates for her. */
  years: z.string().trim().max(NURSING_YEARS_MAX).default(''),
  story: z.string().trim().max(NURSING_STORY_MAX).default(''),
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
  /** A small picture of the first page, so she can recognize the paper by sight. */
  cover: string | null
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

/** Media URLs for page pictures; a page whose picture is gone (or unsafe) gives null. */
function pageUrls(entries: readonly LibraryEntry[]): {
  page: (id: string) => string | null
  cover: (id: string | undefined) => string | null
} {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const url = (fileName: string | undefined): string | null =>
    fileName && isSafeMediaFileName(fileName) ? `grammie-media://nursing/${fileName}` : null
  return {
    page: (id) => url(byId.get(id)?.fileName),
    cover: (id) => {
      const entry = id === undefined ? undefined : byId.get(id)
      return url(entry?.thumbFileName) ?? url(entry?.fileName)
    }
  }
}

/** Words and page URLs only. A page whose picture is gone is null, so Home can say so calmly. */
export function nursingForHome(file: NursingFile, entries: readonly LibraryEntry[]): HomeNursing {
  const urls = pageUrls(entries)
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
        pages: paper.pages.map(urls.page),
        cover: urls.cover(paper.pages[0])
      }))
    }))
  }
}

/* ---- The caregiver's editor (admin) ---- */

/** A chapter's words; no id makes a new chapter at the end of her career. */
export const nursingChapterInputSchema = z.object({
  id: uuid.optional(),
  title: line(NURSING_TITLE_MAX),
  years: z.string().trim().max(NURSING_YEARS_MAX).default(''),
  story: z.string().trim().max(NURSING_STORY_MAX).default('')
})
export type NursingChapterInput = z.input<typeof nursingChapterInputSchema>

/** A paper's words; its pages come only from the picker in main. */
export const nursingPaperInputSchema = z.object({
  chapterId: uuid,
  id: uuid.optional(),
  title: line(NURSING_PAPER_TITLE_MAX),
  note: z.string().trim().max(NURSING_NOTE_MAX).default('')
})
export type NursingPaperInput = z.input<typeof nursingPaperInputSchema>

export type NursingMove = 'earlier' | 'later'
export const nursingMoveSchema = z.enum(['earlier', 'later'])

export interface AdminNursingPaper {
  id: string
  title: string
  note: string
  pageCount: number
  /** Pages whose picture is gone; the caregiver can remove the paper and add it again. */
  missingPages: number
  cover: string | null
}

export interface AdminNursingChapter {
  id: string
  title: string
  years: string
  story: string
  papers: AdminNursingPaper[]
}

export interface AdminNursing {
  chapters: AdminNursingChapter[]
}

export interface NursingPaperImportResult {
  nursing: AdminNursing
  /** Pages added; 0 when the caregiver cancelled the picker. */
  added: number
  /** Pictures that could not be read and were left out. */
  failed: number
}

export function nursingForAdmin(file: NursingFile, entries: readonly LibraryEntry[]): AdminNursing {
  const urls = pageUrls(entries)
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
        pageCount: paper.pages.length,
        missingPages: paper.pages.filter((id) => urls.page(id) === null).length,
        cover: urls.cover(paper.pages[0])
      }))
    }))
  }
}

/** Swaps an item with its neighbour; the ends and unknown IDs leave the list as it was. */
export function moveNursingItem<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: NursingMove
): T[] {
  const from = items.findIndex((item) => item.id === id)
  const to = direction === 'earlier' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= items.length) return [...items]
  const moved = [...items]
  ;[moved[from], moved[to]] = [moved[to]!, moved[from]!]
  return moved
}

/** A chapter card's second line on Home: "1967 - 1999 · 3 papers". */
export function chapterDetail(years: string, papers: number): string {
  const count = papers === 0 ? '' : papers === 1 ? '1 paper' : `${papers} papers`
  return [years, count].filter(Boolean).join(' · ')
}

/** How she reads a paper's page count: "1 page", "12 pages". */
export function pageCount(count: number): string {
  return count === 1 ? '1 page' : `${count} pages`
}
