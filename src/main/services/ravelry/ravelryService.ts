import { lookup } from 'node:dns/promises'
import {
  MAX_RAVELRY_RESULTS,
  parseRavelryLastPage,
  parseRavelryPattern,
  parseRavelrySearch,
  type RavelryBrowseItem,
  type RavelryPatternDetails,
  type RavelrySearchResult,
  type RavelryStatus
} from '@shared/knitting/ravelry'
import { download, IMAGE_MAX_BYTES } from '../news/newsService'
import type { RavelryKey, RavelryKeyStore } from './ravelryKey'

const RAVELRY_API = 'https://api.ravelry.com'
const TIMEOUT_MS = 10_000
const MAX_REPLY_BYTES = 2 * 1024 * 1024
export const RAVELRY_PICTURE_MAX_BYTES = 2 * 1024 * 1024
const THUMBNAIL_TIMEOUT_MS = 3_000
const MAX_QUERY_LENGTH = 80
const PDF_MAX_BYTES = 30 * 1024 * 1024
const PDF_TIMEOUT_MS = 30_000
const BROWSE_PAGE_SIZE = 4
// Eight categories ask at once when she opens Find a pattern, so these get longer than a thumbnail.
const BROWSE_PICTURE_TIMEOUT_MS = 8_000
// Some hosts send PDFs as generic bytes, so the file's own first bytes decide (see instructions).
const PDF_TYPES = new Set(['application/pdf', 'application/octet-stream'])
const isRavelrySite = (url: string): boolean =>
  ['ravelry.com', 'www.ravelry.com'].includes(new URL(url).hostname)

/** The sentences here reach the caregiver, so none of them can carry an address or a key. */
const UNREACHABLE = "Ravelry can't be reached right now. Try again in a little while."
const SLOW_DOWN = 'Ravelry asked us to slow down. Try again later.'
const REFUSED = "Ravelry didn't accept that key. Check both parts and try again."
const UNEXPECTED = "Ravelry sent something this app couldn't read. Try again later."
const NOT_READ_ONLY =
  "That isn't a read-only key, so it wasn't saved. Its username starts with read-. A personal key can change the Ravelry account, and this computer shouldn't hold one."
const NOT_CONNECTED = 'Add a read-only Ravelry key first.'

export interface RavelrySource {
  pattern(ravelryId: number): Promise<RavelryPatternDetails>
  /** The pattern on a Ravelry page she is viewing, found from the name in its address. */
  patternByPermalink(permalink: string): Promise<RavelryPatternDetails>
  picture(url: string): Promise<{ bytes: Uint8Array; mime: string }>
  instructions(url: string): Promise<Uint8Array>
  status(): RavelryStatus
  /** One page of free knitting patterns in a category, most popular first. */
  browse(category: string, page: number): Promise<{ items: RavelryBrowseItem[]; lastPage: number }>
}

export interface RavelryService extends RavelrySource {
  /** Tries the key once against Ravelry and returns it tidied; nothing is saved yet. */
  checkKey(username: unknown, key: unknown): Promise<RavelryKey>
  saveKey(checked: RavelryKey): void
  removeKey(): void
  search(query: unknown): Promise<RavelrySearchResult[]>
}

type Dependencies = {
  store: () => RavelryKeyStore
  canEncrypt: () => boolean
  fetchImpl?: typeof fetch
  /**
   * Ravelry's own download links can need the sign-in from her browser. Used only for
   * ravelry.com addresses, so that sign-in is never sent anywhere else.
   */
  signedInFetch?: typeof fetch
  lookupImpl?: Parameters<typeof download>[5]
  log: (detail: string) => void
}

/** One instance per app; injectable I/O keeps the tests off the network. */
export function createRavelryService({
  store,
  canEncrypt,
  // Looked up per call, so e2e can stand in for Ravelry from the main process.
  fetchImpl = (input, init) => globalThis.fetch(input, init),
  signedInFetch,
  lookupImpl = lookup,
  log
}: Dependencies): RavelryService {
  function currentKey(): RavelryKey {
    const saved = store().load()
    if (!saved) throw new Error(NOT_CONNECTED)
    return saved
  }

  /** Fixed host, no redirects: the key is only ever sent to Ravelry's own API. */
  async function getJson(path: string, { username, key }: RavelryKey): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetchImpl(`${RAVELRY_API}${path}`, {
        signal: controller.signal,
        redirect: 'error',
        headers: {
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}`
        }
      })
      if (!response.ok) {
        log(`HTTP ${response.status}`)
        throw new Error(
          response.status === 401 || response.status === 403
            ? REFUSED
            : response.status === 429
              ? SLOW_DOWN
              : UNREACHABLE
        )
      }
      if (Number(response.headers.get('content-length')) > MAX_REPLY_BYTES) {
        log('Reply too large')
        throw new Error(UNEXPECTED)
      }
      // Reads as it goes: Content-Length can lie or be absent.
      const reader = response.body?.getReader()
      if (!reader) throw new Error(UNEXPECTED)
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_REPLY_BYTES) {
          log('Reply too large')
          throw new Error(UNEXPECTED)
        }
        chunks.push(chunk.value)
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        log('Reply not JSON')
        throw new Error(UNEXPECTED)
      }
    } catch (error) {
      if (
        error instanceof Error &&
        [REFUSED, SLOW_DOWN, UNEXPECTED, UNREACHABLE].includes(error.message)
      ) {
        throw error
      }
      // Fetch errors can embed URLs; only the error's name goes in the log.
      log(error instanceof Error ? error.name : 'Unknown failure')
      throw new Error(UNREACHABLE)
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  async function thumbnail(
    source: string | undefined,
    timeoutMs = THUMBNAIL_TIMEOUT_MS
  ): Promise<{ thumbnailUrl?: string }> {
    if (!source) return {}
    try {
      const image = await download(source, fetchImpl, IMAGE_MAX_BYTES, timeoutMs, true, lookupImpl)
      return {
        thumbnailUrl: `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`
      }
    } catch {
      // A result is still worth choosing from without its picture.
      return {}
    }
  }

  return {
    status: () => ({ connected: store().load() !== null, canSave: canEncrypt() }),

    async checkKey(username, key) {
      if (!canEncrypt()) {
        throw new Error("Windows can't encrypt the key on this computer, so it can't be saved.")
      }
      const name = typeof username === 'string' ? username.trim() : ''
      const secret = typeof key === 'string' ? key.trim() : ''
      if (!name || !secret) throw new Error('Enter both the username and the password.')
      if (!name.startsWith('read-')) throw new Error(NOT_READ_ONLY)
      if (/[\s:]/.test(name) || /\s/.test(secret) || name.length + secret.length > 400) {
        throw new Error(REFUSED)
      }
      const checked = { username: name, key: secret }
      await getJson('/patterns/search.json?query=knitting&page_size=1', checked)
      return checked
    },

    saveKey: (checked) => store().save(checked),
    removeKey: () => store().clear(),

    async search(query) {
      const words = typeof query === 'string' ? query.trim() : ''
      if (!words) throw new Error('Type what to look for.')
      if (words.length > MAX_QUERY_LENGTH) throw new Error('Try a shorter search.')
      const params = new URLSearchParams({
        query: words,
        craft: 'knitting',
        page_size: String(MAX_RAVELRY_RESULTS)
      })
      const found = parseRavelrySearch(
        await getJson(`/patterns/search.json?${params}`, currentKey())
      )
      if (!found) {
        log('Unreadable search reply')
        throw new Error(UNEXPECTED)
      }
      return Promise.all(
        found
          .slice(0, MAX_RAVELRY_RESULTS)
          .map(async ({ ravelryId, name, designer, thumbnailSource }) => ({
            // Named one by one: nothing from Ravelry but data: pictures may reach admin.
            ravelryId,
            name,
            designer,
            ...(await thumbnail(thumbnailSource))
          }))
      )
    },

    async pattern(ravelryId) {
      const details = parseRavelryPattern(
        await getJson(`/patterns/${ravelryId}.json`, currentKey())
      )
      if (!details || details.ravelryId !== ravelryId) {
        log('Unreadable pattern reply')
        throw new Error(UNEXPECTED)
      }
      return details
    },

    async patternByPermalink(permalink) {
      // parseRavelryPatternPage has already limited this to letters, digits and hyphens.
      const details = parseRavelryPattern(
        await getJson(`/patterns/${encodeURIComponent(permalink)}.json`, currentKey())
      )
      if (!details) {
        log('Unreadable pattern reply')
        throw new Error(UNEXPECTED)
      }
      return details
    },

    async browse(category, page) {
      const params = new URLSearchParams({
        craft: 'knitting',
        availability: 'free',
        sort: 'popularity',
        pc: category,
        page: String(page),
        page_size: String(BROWSE_PAGE_SIZE)
      })
      const reply = await getJson(`/patterns/search.json?${params}`, currentKey())
      const found = parseRavelrySearch(reply)
      if (!found) {
        log('Unreadable browse reply')
        throw new Error(UNEXPECTED)
      }
      const items = await Promise.all(
        found
          .slice(0, BROWSE_PAGE_SIZE)
          .map(async ({ ravelryId, name, designer, pictureSource }) => ({
            ravelryId,
            name,
            designer,
            ...(await thumbnail(pictureSource, BROWSE_PICTURE_TIMEOUT_MS))
          }))
      )
      return { items, lastPage: parseRavelryLastPage(reply) }
    },

    async instructions(url) {
      // Never the API key: these addresses belong to designers' own sites too.
      const fetchPdf = async (impl: typeof fetch): Promise<Uint8Array> => {
        const { bytes } = await download(
          url,
          impl,
          PDF_MAX_BYTES,
          PDF_TIMEOUT_MS,
          true,
          lookupImpl,
          PDF_TYPES
        )
        if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') {
          throw new Error('Not a PDF')
        }
        return bytes
      }
      try {
        return await fetchPdf(fetchImpl)
      } catch (plainFailure) {
        if (!signedInFetch || !isRavelrySite(url)) throw plainFailure
      }
      // Some of Ravelry's own links need an account. Her browser's session can't report a
      // redirect (manual throws "Redirect was cancelled"), so it follows them and the place it
      // ended up is checked instead: her sign-in only ever goes to Ravelry and its file host.
      return fetchPdf(async (input, init) => {
        const response = await signedInFetch(input, { ...init, redirect: 'follow' })
        const host = new URL(response.url || String(input)).hostname
        if (
          !['ravelry.com', 'www.ravelry.com'].includes(host) &&
          !host.endsWith('.ravelrycache.com')
        ) {
          await response.body?.cancel()
          throw new Error('Left Ravelry')
        }
        return response
      })
    },

    async picture(url) {
      const { bytes, mime } = await download(
        url,
        fetchImpl,
        RAVELRY_PICTURE_MAX_BYTES,
        TIMEOUT_MS,
        true,
        lookupImpl
      )
      return { bytes, mime }
    }
  }
}
