import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RavelryKeyStore } from '../../src/main/services/ravelry/ravelryKey'
import { createRavelryService } from '../../src/main/services/ravelry/ravelryService'

const READ_KEY = { username: 'read-abc123', key: 'sekret-value' }
const codec = {
  encrypt: (value: string) => Buffer.from(value, 'utf8').reverse(),
  decrypt: (value: Buffer) => Buffer.from(value).reverse().toString('utf8')
}
const fixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'tests/fixtures/ravelry', name), 'utf8')
const json = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } })

let folder: string
let store: RavelryKeyStore
let log: string[]
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>
const service = (canEncrypt = true): ReturnType<typeof createRavelryService> =>
  createRavelryService({
    store: () => store,
    canEncrypt: () => canEncrypt,
    fetchImpl,
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    log: (detail) => log.push(detail)
  })
const everythingLogged = (): string => JSON.stringify(log)

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'grammieguide-ravelry-service-'))
  store = new RavelryKeyStore(join(folder, 'ravelry-key.enc'), codec)
  log = []
  fetchImpl = vi.fn<typeof fetch>(async () => json(fixture('search.json')))
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('the saved key', () => {
  it('is never plain text on disk', () => {
    store.save(READ_KEY)
    const raw = readFileSync(join(folder, 'ravelry-key.enc'), 'utf8')
    expect(raw).not.toContain(READ_KEY.key)
    expect(raw).not.toContain(READ_KEY.username)
    expect(store.load()).toEqual(READ_KEY)
  })

  it('reads as no key when Windows can no longer decrypt it', () => {
    writeFileSync(join(folder, 'ravelry-key.enc'), 'not what was saved')
    expect(store.load()).toBeNull()
    expect(service().status().connected).toBe(false)
  })

  it('is gone after removing it, and status never carries it', () => {
    store.save(READ_KEY)
    const status = service().status()
    expect(status).toEqual({ connected: true, canSave: true })
    expect(JSON.stringify(status)).not.toContain(READ_KEY.username)
    service().removeKey()
    expect(existsSync(join(folder, 'ravelry-key.enc'))).toBe(false)
    expect(service().status().connected).toBe(false)
  })
})

describe('checking a key', () => {
  it('refuses a personal key without sending it anywhere', async () => {
    await expect(service().checkKey('my-access-key', 'personal')).rejects.toThrow(
      "That isn't a read-only key"
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses when Windows cannot encrypt, so a key is never kept in plain text', async () => {
    await expect(service(false).checkKey(READ_KEY.username, READ_KEY.key)).rejects.toThrow(
      "Windows can't encrypt the key"
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['', 'x'],
    ['read-abc', ''],
    [undefined, undefined],
    [42, {}]
  ])('asks for both parts when given %j and %j', async (username, key) => {
    await expect(service().checkKey(username, key)).rejects.toThrow('Enter both')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['read-a b', 'x'],
    ['read-a:b', 'x'],
    ['read-abc', 'two words']
  ])('refuses a malformed key %s without sending it', async (username, key) => {
    await expect(service().checkKey(username, key)).rejects.toThrow("didn't accept")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends it only to Ravelry, over https, refusing redirects, and saves nothing itself', async () => {
    const checked = await service().checkKey(`  ${READ_KEY.username} `, ` ${READ_KEY.key}\n`)
    expect(checked).toEqual(READ_KEY)
    expect(store.load()).toBeNull()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(new URL(String(url)).origin).toBe('https://api.ravelry.com')
    expect(init?.redirect).toBe('error')
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from(`${READ_KEY.username}:${READ_KEY.key}`).toString('base64')}`
    )
  })

  it.each([
    [401, "didn't accept"],
    [403, "didn't accept"],
    [429, 'slow down'],
    [500, "can't be reached"]
  ])('says something calm for HTTP %i', async (status, words) => {
    fetchImpl.mockResolvedValue(json('{}', status))
    await expect(service().checkKey(READ_KEY.username, READ_KEY.key)).rejects.toThrow(words)
    expect(everythingLogged()).toContain(`HTTP ${status}`)
  })

  it('keeps addresses and the key out of what a network failure says and logs', async () => {
    fetchImpl.mockRejectedValue(
      new TypeError(`fetch failed for https://${READ_KEY.username}:${READ_KEY.key}@api.ravelry.com`)
    )
    const failure = await service()
      .checkKey(READ_KEY.username, READ_KEY.key)
      .catch((error: Error) => error.message)
    expect(failure).toBe("Ravelry can't be reached right now. Try again in a little while.")
    expect(everythingLogged()).toBe('["TypeError"]')
  })
})

describe('searching', () => {
  beforeEach(() => store.save(READ_KEY))

  it('needs a saved key first', async () => {
    store.clear()
    await expect(service().search('hat')).rejects.toThrow('Add a read-only Ravelry key first.')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('asks for knitting patterns and returns thumbnails as data, not addresses', async () => {
    fetchImpl.mockImplementation(async (input) =>
      String(input).startsWith('https://api.ravelry.com/')
        ? json(fixture('search.json'))
        : new Response(Buffer.from('picture'), { headers: { 'content-type': 'image/jpeg' } })
    )
    const results = await service().search('baby & blanket')
    const url = new URL(String(fetchImpl.mock.calls[0]![0]))
    expect(url.pathname).toBe('/patterns/search.json')
    expect(url.searchParams.get('query')).toBe('baby & blanket')
    expect(url.searchParams.get('craft')).toBe('knitting')
    expect(results).toHaveLength(3)
    expect(results[0]).toEqual({
      ravelryId: 1359829,
      name: 'Sweet Shop Blanket',
      designer: 'Laura Penrose',
      thumbnailUrl: `data:image/jpeg;base64,${Buffer.from('picture').toString('base64')}`
    })
    expect(JSON.stringify(results)).not.toContain('ravelrycache.com')
  })

  it('still lists a result whose thumbnail fails or is not a picture', async () => {
    fetchImpl.mockImplementation(async (input) =>
      String(input).startsWith('https://api.ravelry.com/')
        ? json(fixture('search.json'))
        : new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
    )
    const [first] = await service().search('hat')
    expect(first).toEqual({
      ravelryId: 1359829,
      name: 'Sweet Shop Blanket',
      designer: 'Laura Penrose'
    })
  })

  it('refuses an empty or overlong search before asking Ravelry', async () => {
    await expect(service().search('   ')).rejects.toThrow('Type what to look for.')
    await expect(service().search('x'.repeat(81))).rejects.toThrow('Try a shorter search.')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never logs what was searched for', async () => {
    fetchImpl.mockResolvedValue(json('not json'))
    await expect(service().search('private words')).rejects.toThrow("couldn't read")
    expect(everythingLogged()).not.toContain('private')
  })

  it('stops reading a reply that is too large, even without a Content-Length', async () => {
    const huge = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024))
      }
    })
    fetchImpl.mockResolvedValue(new Response(huge))
    await expect(service().search('hat')).rejects.toThrow("couldn't read")
    expect(everythingLogged()).toContain('Reply too large')
  })
})

describe('fetching a pattern', () => {
  beforeEach(() => store.save(READ_KEY))

  it('reads the saved pattern', async () => {
    fetchImpl.mockResolvedValue(json(fixture('pattern.json')))
    const details = await service().pattern(1359829)
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://api.ravelry.com/patterns/1359829.json'
    )
    expect(details.name).toBe('Sweet Shop Blanket')
  })

  it('refuses a reply about some other pattern', async () => {
    fetchImpl.mockResolvedValue(json(fixture('pattern.json')))
    await expect(service().pattern(2)).rejects.toThrow("couldn't read")
  })

  it('refuses a picture on a private address, and anything that is not a picture', async () => {
    fetchImpl.mockResolvedValue(new Response('x', { headers: { 'content-type': 'image/jpeg' } }))
    await expect(service().picture('https://127.0.0.1/a.jpg')).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
    fetchImpl.mockResolvedValue(
      new Response('<html>', { headers: { 'content-type': 'text/html' } })
    )
    await expect(service().picture('https://images.example.com/a.jpg')).rejects.toThrow()
  })

  it('never logs the key', async () => {
    fetchImpl.mockResolvedValue(json('{}', 500))
    await expect(service().pattern(1)).rejects.toThrow()
    expect(everythingLogged()).not.toContain(READ_KEY.key)
    expect(everythingLogged()).not.toContain(READ_KEY.username)
  })
})

describe('browsing for her', () => {
  beforeEach(() => store.save(READ_KEY))

  it('asks only for free knitting patterns, most popular first, four at a time', async () => {
    fetchImpl.mockImplementation(async (input) =>
      String(input).startsWith('https://api.ravelry.com/')
        ? json(fixture('search.json'))
        : new Response(Buffer.from('picture'), { headers: { 'content-type': 'image/jpeg' } })
    )
    const { items, lastPage } = await service().browse('blanket', 3)
    const url = new URL(String(fetchImpl.mock.calls[0]![0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      craft: 'knitting',
      availability: 'free',
      sort: 'popularity',
      pc: 'blanket',
      page: '3',
      page_size: '4'
    })
    expect(lastPage).toBe(200)
    expect(items[0]!.thumbnailUrl).toMatch(/^data:image\/jpeg;base64,/)
    // The card-sized picture, not the small thumbnail admin uses.
    expect(fetchImpl.mock.calls.map(([url]) => String(url)).join()).toContain('_medium.')
  })
})

describe('fetching a pattern from its page', () => {
  beforeEach(() => store.save(READ_KEY))

  it('looks it up by the name in the address', async () => {
    fetchImpl.mockResolvedValue(json(fixture('pattern.json')))
    const details = await service().patternByPermalink('sweet-shop-blanket')
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://api.ravelry.com/patterns/sweet-shop-blanket.json'
    )
    expect(details.ravelryId).toBe(1359829)
  })
})

describe('fetching instructions', () => {
  const PDF = Buffer.from('%PDF-1.4 a pattern')
  const pdfReply = (type = 'application/pdf'): Response =>
    new Response(PDF, { headers: { 'content-type': type } })

  it('accepts a real PDF, and never sends the Ravelry key with it', async () => {
    store.save(READ_KEY)
    fetchImpl.mockResolvedValue(pdfReply())
    const bytes = await service().instructions('https://designer.example.com/hat.pdf')
    expect(Buffer.from(bytes).toString()).toBe(PDF.toString())
    expect(JSON.stringify(fetchImpl.mock.calls[0]![1])).not.toContain('authorization')
  })

  it('decides by the file itself when a host sends generic bytes', async () => {
    fetchImpl.mockResolvedValueOnce(pdfReply('application/octet-stream'))
    await expect(service().instructions('https://designer.example.com/a')).resolves.toBeDefined()
    fetchImpl.mockResolvedValueOnce(
      new Response('<html>', { headers: { 'content-type': 'application/octet-stream' } })
    )
    await expect(service().instructions('https://designer.example.com/b')).rejects.toThrow()
  })

  it('refuses a web page, a private address and an oversized file', async () => {
    fetchImpl.mockResolvedValueOnce(
      new Response('<html>', { headers: { 'content-type': 'text/html' } })
    )
    await expect(service().instructions('https://designer.example.com/page')).rejects.toThrow()
    fetchImpl.mockClear()
    await expect(service().instructions('https://127.0.0.1/hat.pdf')).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
    fetchImpl.mockResolvedValueOnce(
      new Response(PDF, {
        headers: { 'content-type': 'application/pdf', 'content-length': String(31 * 1024 * 1024) }
      })
    )
    await expect(service().instructions('https://designer.example.com/huge.pdf')).rejects.toThrow()
  })

  describe('when a link needs her browser sign-in', () => {
    const htmlReply = (): Response =>
      new Response('<html>Sign in', { headers: { 'content-type': 'text/html' } })
    const withSignIn = (signedInFetch: typeof fetch): ReturnType<typeof createRavelryService> =>
      createRavelryService({
        store: () => store,
        canEncrypt: () => true,
        fetchImpl,
        signedInFetch,
        lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
        log: () => undefined
      })
    const signedInReply = (url: string): Response => {
      const reply = pdfReply()
      Object.defineProperty(reply, 'url', { value: url })
      return reply
    }

    it('is not used when the plain route already gets the PDF', async () => {
      const signedInFetch = vi.fn<typeof fetch>()
      fetchImpl.mockImplementation(async () => pdfReply())
      await withSignIn(signedInFetch).instructions('https://www.ravelry.com/dls/1/2')
      expect(signedInFetch).not.toHaveBeenCalled()
    })

    it('follows a plain redirect to the PDF, checking where it goes', async () => {
      const signedInFetch = vi.fn<typeof fetch>()
      fetchImpl.mockImplementation(async (input) =>
        String(input).includes('ravelry.com/dls')
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://pdf.ravelrycache.com/designer/hat.pdf' }
            })
          : pdfReply()
      )
      await withSignIn(signedInFetch).instructions('https://www.ravelry.com/dls/1/2')
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
        'https://www.ravelry.com/dls/1/2',
        'https://pdf.ravelrycache.com/designer/hat.pdf'
      ])
      expect(signedInFetch).not.toHaveBeenCalled()
    })

    it('tries it for a Ravelry link that only gave a web page, following its redirects', async () => {
      fetchImpl.mockImplementation(async () => htmlReply())
      const signedInFetch = vi.fn<typeof fetch>(async () =>
        signedInReply('https://pdf.ravelrycache.com/designer/hat.pdf')
      )
      const bytes = await withSignIn(signedInFetch).instructions('https://www.ravelry.com/dls/1/2')
      expect(Buffer.from(bytes).toString()).toBe(PDF.toString())
      expect(signedInFetch.mock.calls[0]![1]?.redirect).toBe('follow')
    })

    it('never uses it for anyone but Ravelry', async () => {
      fetchImpl.mockImplementation(async () => htmlReply())
      const signedInFetch = vi.fn<typeof fetch>()
      for (const url of [
        'https://designer.example.com/hat.pdf',
        'https://www.ravelry.com.evil.example/hat.pdf'
      ]) {
        await expect(withSignIn(signedInFetch).instructions(url)).rejects.toThrow()
      }
      expect(signedInFetch).not.toHaveBeenCalled()
    })

    it('refuses a signed-in redirect that ends up somewhere else', async () => {
      fetchImpl.mockImplementation(async () => htmlReply())
      const signedInFetch = vi.fn<typeof fetch>(async () =>
        signedInReply('https://evil.example.com/hat.pdf')
      )
      await expect(
        withSignIn(signedInFetch).instructions('https://www.ravelry.com/dls/1/2')
      ).rejects.toThrow('Left Ravelry')
    })
  })
})
