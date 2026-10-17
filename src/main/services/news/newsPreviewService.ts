import type { Tile } from '@shared/configSchema'
import { newsSourceFor, type NewsPreview } from '@shared/news/sources'

const CACHE_MS = 15 * 60_000
const RETRY_MS = 60_000
const MAX_IMAGE_CHARS = 400_000
const MAX_ENTRIES = 48
const MAX_PENDING = 6

type Entry = { url: string; preview: NewsPreview; retryAt: number; pending?: Promise<NewsPreview> }
type Dependencies = {
  getTile: (tileId: string) => Tile | undefined
  capture: (url: string) => Promise<string>
  now?: () => number
}

/** Screenshots are serialized and bounded; repeated opens never spawn a fleet of web pages. */
export function createNewsPreviewService({ getTile, capture, now = Date.now }: Dependencies): {
  get: (tileId: string, sourceId: string) => Promise<NewsPreview>
} {
  const cache = new Map<string, Entry>()
  let queue: Promise<unknown> = Promise.resolve()
  let pendingCount = 0

  return {
    async get(tileId: string, sourceId: string): Promise<NewsPreview> {
      const source = newsSourceFor(getTile(tileId), sourceId)
      if (!source) return {}
      const key = JSON.stringify([tileId, sourceId])
      let entry = cache.get(key)
      if (!entry || entry.url !== source.url) {
        entry = { url: source.url, preview: {}, retryAt: 0 }
        cache.set(key, entry)
        if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
      }
      if (entry.pending) return entry.pending
      if (now() < entry.retryAt || pendingCount >= MAX_PENDING) return entry.preview
      const current = entry
      pendingCount++
      const work = queue.then(async () => {
        // Caregivers may edit/remove a source while an earlier screenshot is loading.
        if (newsSourceFor(getTile(tileId), sourceId)?.url !== current.url) return {}
        try {
          const image = await capture(current.url)
          if (!image.startsWith('data:image/jpeg;base64,') || image.length > MAX_IMAGE_CHARS) {
            throw new Error('Invalid preview')
          }
          current.preview = { image, capturedAt: now() }
          current.retryAt = now() + CACHE_MS
        } catch {
          // An offline site leaves the last good picture (or just its named card).
          current.retryAt = now() + RETRY_MS
        }
        return newsSourceFor(getTile(tileId), sourceId)?.url === current.url ? current.preview : {}
      })
      queue = work.catch(() => undefined)
      current.pending = work.finally(() => {
        current.pending = undefined
        pendingCount--
      })
      return current.pending
    }
  }
}
