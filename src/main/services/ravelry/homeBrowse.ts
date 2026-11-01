import {
  RAVELRY_CATEGORIES,
  type RavelryBrowseResult,
  type RavelryCategoriesResult,
  type RavelryPreviewResult
} from '@shared/knitting/ravelry'
import type { RavelrySource } from './ravelryService'

const CACHE_MS = 15 * 60_000
const MAX_CACHED_PAGES = 64
const MAX_SERVED = 2_000
const MAX_PREVIEW_PICTURES = 6
const MAX_PAGE = 200

export interface RavelryHomeBrowse {
  categories(): Promise<RavelryCategoriesResult>
  browse(category: unknown, page: unknown): Promise<RavelryBrowseResult>
  preview(ravelryId: unknown): Promise<RavelryPreviewResult>
  isServed(ravelryId: number): boolean
}

type CachedPage = { at: number; result: Extract<RavelryBrowseResult, { ok: true }> }

/**
 * What Home may ask Ravelry for: the fixed categories, and then only patterns already served
 * to it. Home names a category and a page, never a search or an address. Every failure is
 * `ok: false`, which she sees as one calm line. Browsing is the only part of Home that uses the
 * network for this; what she saves still works offline.
 */
export function createRavelryHomeBrowse(
  source: Pick<RavelrySource, 'browse' | 'pattern' | 'picture'>,
  now: () => number = Date.now
): RavelryHomeBrowse {
  const pages = new Map<string, CachedPage>()
  const served = new Set<number>()

  const remember = (ravelryId: number): void => {
    served.add(ravelryId)
    if (served.size > MAX_SERVED) served.delete(served.values().next().value!)
  }

  const browse: RavelryHomeBrowse['browse'] = async (category, page) => {
    const chosen = RAVELRY_CATEGORIES.find((item) => item.id === category)
    if (!chosen || !Number.isSafeInteger(page)) return { ok: false }
    const wanted = page as number
    if (wanted < 1 || wanted > MAX_PAGE) return { ok: false }
    const key = `${chosen.id}:${wanted}`
    const cached = pages.get(key)
    if (cached && now() - cached.at < CACHE_MS) return cached.result
    try {
      const { items, lastPage } = await source.browse(chosen.pc, wanted)
      items.forEach((item) => remember(item.ravelryId))
      const result = {
        ok: true as const,
        items,
        page: wanted,
        lastPage: Math.min(lastPage, MAX_PAGE)
      }
      pages.set(key, { at: now(), result })
      if (pages.size > MAX_CACHED_PAGES) pages.delete(pages.keys().next().value!)
      return result
    } catch {
      return { ok: false }
    }
  }

  return {
    browse,
    isServed: (ravelryId) => served.has(ravelryId),

    async categories() {
      const results = await Promise.all(RAVELRY_CATEGORIES.map((item) => browse(item.id, 1)))
      if (!results.some((result) => result.ok)) return { ok: false }
      return {
        ok: true,
        categories: RAVELRY_CATEGORIES.map((item, index) => {
          const result = results[index]!
          // The most popular pattern that has a picture: not every pattern does.
          const thumbnailUrl = result.ok
            ? result.items.find((found) => found.thumbnailUrl)?.thumbnailUrl
            : undefined
          return { id: item.id, label: item.label, ...(thumbnailUrl && { thumbnailUrl }) }
        })
      }
    },

    async preview(ravelryId) {
      if (!Number.isSafeInteger(ravelryId) || !served.has(ravelryId as number)) return { ok: false }
      try {
        const details = await source.pattern(ravelryId as number)
        const pictures = await Promise.all(
          details.pictureUrls.slice(0, MAX_PREVIEW_PICTURES).map(async (url) => {
            try {
              const { bytes, mime } = await source.picture(url)
              return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
            } catch {
              return null
            }
          })
        )
        return {
          ok: true,
          ravelryId: details.ravelryId,
          name: details.name,
          designer: details.designer,
          facts: details.facts,
          notes: details.notes,
          pictures: pictures.filter((url): url is string => url !== null)
        }
      } catch {
        return { ok: false }
      }
    }
  }
}
