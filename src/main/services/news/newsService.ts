import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isPublicAddress } from './publicAddress'
import type { Tile } from '@shared/configSchema'
import { httpUrl } from '@shared/news/httpUrl'
import { parseFeed } from '@shared/news/parseFeed'
import type { NewsResult, NewsStory } from '@shared/news/types'

export const NEWS_CACHE_MS = 15 * 60_000
export const FEED_MAX_BYTES = 2 * 1024 * 1024
export const IMAGE_MAX_BYTES = 300 * 1024
const MAX_STORIES = 10
const RETRY_MS = 60_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

class NewsFetchError extends Error {}

type Lookup = (
  hostname: string,
  options: { all: true }
) => Promise<{ address: string; family: number }[]>

type Dependencies = {
  getTile: (id: string) => Tile | undefined
  fetchImpl?: typeof fetch
  lookupImpl?: Lookup
  now?: () => number
  log: (op: string, detail: string) => void
}
type Entry = {
  feed: string
  good?: Extract<NewsResult, { ok: true }>
  retryAt: number
  pending?: Promise<NewsResult>
}

/** The caregiver chose the feed; its publisher chose the images, so only images need this guard. */
async function checkThumbnailAddress(
  url: string,
  lookupImpl: Lookup,
  signal: AbortSignal
): Promise<void> {
  const hostname = new URL(url).hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new NewsFetchError('Non-public thumbnail address')
    return
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || !hostname.includes('.')) {
    throw new NewsFetchError('Non-public thumbnail host')
  }
  // DNS itself is not abortable; stop waiting when the shared image deadline expires.
  let onAbort: () => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new NewsFetchError('Thumbnail lookup timed out'))
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  try {
    const addresses = await Promise.race([lookupImpl(hostname, { all: true }), aborted])
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new NewsFetchError('Non-public thumbnail address')
    }
    // Fetch resolves again: this check does not pin the connection against DNS rebinding.
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function decodeFeed(bytes: Uint8Array, charset: string | undefined): string {
  const bom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? 'utf-8'
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : undefined
  const declaration = String.fromCharCode(...bytes.subarray(0, 200)).match(
    /^\s*<\?xml\s[^?]*\bencoding\s*=\s*["']([^"']+)["']/i
  )?.[1]
  try {
    return new TextDecoder(bom ?? charset ?? declaration ?? 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

/** Limits streamed/decompressed bytes too; Content-Length alone can lie or be absent. */
async function download(
  url: string,
  fetchImpl: typeof fetch,
  maxBytes: number,
  timeoutMs: number,
  image: boolean,
  lookupImpl: Lookup
): Promise<{ bytes: Uint8Array; mime: string; charset: string | undefined }> {
  if (!httpUrl(url)) throw new NewsFetchError('Unsupported address')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    let response: Response
    let current = url
    for (let hops = 0; ; hops++) {
      if (!httpUrl(current)) throw new NewsFetchError('Unsupported redirect')
      if (image) await checkThumbnailAddress(current, lookupImpl, controller.signal)
      controller.signal.throwIfAborted()
      response = await fetchImpl(current, {
        signal: controller.signal,
        redirect: image ? 'manual' : 'follow'
      })
      if (!image || ![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (hops >= 3 || !location) throw new NewsFetchError('Unsupported redirect')
      current = new URL(location, current).href
    }
    if (!response.ok) throw new NewsFetchError(`HTTP ${response.status}`)
    if (response.url && !httpUrl(response.url)) throw new NewsFetchError('Unsupported redirect')
    const contentType = response.headers.get('content-type') ?? ''
    const mime = contentType.split(';')[0]!.trim().toLowerCase()
    const charsetMatch = contentType.match(/;\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i)
    const charset = charsetMatch?.[1] ?? charsetMatch?.[2] ?? charsetMatch?.[3]
    // Raster formats only: SVG is a document, not a passive thumbnail.
    if (image && !IMAGE_TYPES.has(mime)) throw new NewsFetchError('Not a supported image')
    if (Number(response.headers.get('content-length')) > maxBytes) {
      throw new NewsFetchError('Response too large')
    }
    if (!response.body) throw new NewsFetchError('Empty response')
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) throw new NewsFetchError('Response too large')
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, mime, charset }
  } finally {
    clearTimeout(timer)
    // Aborting also releases an unread body after a MIME/size rejection.
    controller.abort()
    if (reader) {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}

function failureDetail(error: unknown): string {
  // Fetch errors can embed URLs. Keep diagnostics useful without recording the feed
  // address, article titles, or browsing history in either log.
  return error instanceof NewsFetchError
    ? error.message
    : error instanceof Error
      ? error.name
      : 'Unknown failure'
}

export type NewsService = {
  get(tileId: string): Promise<NewsResult>
  /** The saved site (no storyId) or a story this service served; null for anything else. */
  destination(tileId: string, storyId?: string): string | null
}

/** One service instance per app; injectable I/O and clock keep cache tests offline. */
export function createNewsService({
  getTile,
  fetchImpl = fetch,
  lookupImpl = lookup,
  now = Date.now,
  log
}: Dependencies): NewsService {
  const cache = new Map<string, Entry>()

  function configuredTile(id: string): Tile | undefined {
    const tile = getTile(id)
    return tile?.type === 'builtin' && tile.builtinKey === 'news' ? tile : undefined
  }

  async function refresh(entry: Entry): Promise<NewsResult> {
    try {
      const feed = await download(entry.feed, fetchImpl, FEED_MAX_BYTES, 10_000, false, lookupImpl)
      const parsed = parseFeed(decodeFeed(feed.bytes, feed.charset)).slice(0, MAX_STORIES)
      if (!parsed.length) throw new NewsFetchError('No readable stories')
      const stories: NewsStory[] = await Promise.all(
        parsed.map(async (story) => {
          const { imageUrl, ...preview } = story
          if (!imageUrl) return preview
          try {
            const image = await download(
              imageUrl,
              fetchImpl,
              IMAGE_MAX_BYTES,
              3_000,
              true,
              lookupImpl
            )
            return {
              ...preview,
              thumbnail: `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`
            }
          } catch (error) {
            log('news-thumbnail', failureDetail(error))
            return preview
          }
        })
      )
      const result = { ok: true as const, stories, fetchedAt: now(), stale: false }
      entry.good = result
      entry.retryAt = result.fetchedAt + NEWS_CACHE_MS
      return result
    } catch (error) {
      log('news-feed', failureDetail(error))
      entry.retryAt = now() + RETRY_MS
      return entry.good ? { ...entry.good, stale: true } : { ok: false }
    }
  }

  return {
    async get(tileId: string): Promise<NewsResult> {
      const feed = httpUrl(configuredTile(tileId)?.feedUrl)
      if (!feed) {
        cache.delete(tileId)
        log('news-feed', 'No configured http(s) feed')
        return { ok: false }
      }
      let entry = cache.get(tileId)
      if (!entry || entry.feed !== feed) {
        entry = { feed, retryAt: 0 }
        cache.set(tileId, entry)
        // Bound memory even if a caregiver repeatedly creates/removes tiles.
        if (cache.size > 64) cache.delete(cache.keys().next().value!)
      }
      if (entry.pending) return entry.pending
      if (now() < entry.retryAt) {
        return entry.good
          ? { ...entry.good, stale: now() - entry.good.fetchedAt >= NEWS_CACHE_MS }
          : { ok: false }
      }
      const current = entry
      current.pending = refresh(current).finally(() => {
        current.pending = undefined
      })
      return current.pending
    },

    /** Browser metadata is accepted only for a saved site or a story we actually served. */
    destination(tileId: string, storyId?: string): string | null {
      const tile = configuredTile(tileId)
      if (!tile) return null
      if (storyId === undefined) return httpUrl(tile.url)
      const entry = cache.get(tileId)
      if (!entry || entry.feed !== httpUrl(tile.feedUrl)) return null
      return entry.good?.stories.find((story) => story.id === storyId)?.url ?? null
    }
  }
}
