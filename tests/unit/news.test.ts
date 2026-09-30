import { describe, expect, it, vi, type Mock } from 'vitest'
import type { Tile } from '../../src/shared/configSchema'
import { parseFeed } from '../../src/shared/news/parseFeed'
import { friendlyAge } from '../../src/shared/news/friendlyAge'
import {
  createNewsService,
  FEED_MAX_BYTES,
  IMAGE_MAX_BYTES,
  NEWS_CACHE_MS,
  type NewsService
} from '../../src/main/services/news/newsService'

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test News</title>
    <atom:link href="https://news.test/feed" rel="self" xmlns:atom="http://www.w3.org/2005/Atom"/>
    <item>
      <title><![CDATA[Garden show opens <b>today</b>]]></title>
      <link>https://news.test/garden</link>
      <pubDate>Sun, 27 Sep 2026 14:00:00 GMT</pubDate>
      <description><![CDATA[<p>Roses &amp; tulips <img src="https://img.test/rose.jpg"> fill the hall.</p><script>alert(1)</script>]]></description>
    </item>
    <item>
      <title>Q&amp;A: bakers &#8216;rise&#8217; early</title>
      <link>https://news.test/bakers</link>
      <dc:date>2026-09-27T09:30:00Z</dc:date>
      <description>&lt;p&gt;Fresh bread &lt;em&gt;every&lt;/em&gt; morning.&lt;/p&gt;</description>
      <media:content url="https://img.test/bread.jpg" type="image/jpeg" medium="image"/>
    </item>
    <item>
      <title>Only a podcast</title>
      <link>https://news.test/podcast</link>
      <enclosure url="https://cdn.test/episode.mp3" type="audio/mpeg" length="1"/>
    </item>
    <item>
      <title>Sneaky</title>
      <link>javascript:alert(1)</link>
    </item>
    <item>
      <link>https://news.test/untitled</link>
    </item>
    <item>
      <title>Garden show opens again</title>
      <link>https://news.test/garden</link>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom News</title>
  <entry>
    <title type="html">Library &lt;i&gt;extends&lt;/i&gt; hours</title>
    <link rel="self" href="https://atom.test/api/1"/>
    <link rel="alternate" href="https://atom.test/library"/>
    <updated>2026-09-26T18:00:00Z</updated>
    <summary>${'Long summary. '.repeat(30)}</summary>
  </entry>
  <entry>
    <title>No alternate link</title>
    <link href="https://atom.test/plain"/>
  </entry>
</feed>`

describe('parseFeed', () => {
  it('reads RSS stories as plain text and drops unsafe, untitled and duplicate items', () => {
    const stories = parseFeed(RSS)
    expect(stories.map((s) => s.url)).toEqual([
      'https://news.test/garden',
      'https://news.test/bakers',
      'https://news.test/podcast'
    ])
    const [garden, bakers, podcast] = stories
    expect(garden).toMatchObject({
      id: 'https://news.test/garden',
      title: 'Garden show opens today',
      summary: 'Roses & tulips fill the hall.',
      publishedAt: '2026-09-27T14:00:00.000Z',
      imageUrl: 'https://img.test/rose.jpg'
    })
    expect(bakers).toMatchObject({
      title: 'Q&A: bakers ‘rise’ early',
      summary: 'Fresh bread every morning.',
      publishedAt: '2026-09-27T09:30:00.000Z',
      imageUrl: 'https://img.test/bread.jpg'
    })
    // An audio enclosure is not a thumbnail, and a missing date is left unknown.
    expect(podcast).toMatchObject({ publishedAt: null, summary: '' })
    expect(podcast!.imageUrl).toBeUndefined()
  })

  it('reads Atom, preferring the alternate link, and trims long summaries', () => {
    const [library, plain] = parseFeed(ATOM)
    expect(library).toMatchObject({
      title: 'Library extends hours',
      url: 'https://atom.test/library',
      publishedAt: '2026-09-26T18:00:00.000Z'
    })
    expect(library!.summary.length).toBeLessThanOrEqual(200)
    expect(library!.summary.endsWith('…')).toBe(true)
    expect(plain!.url).toBe('https://atom.test/plain')
  })

  it('fails closed on DTDs, broken markup and things that are not feeds', () => {
    expect(parseFeed('<!DOCTYPE rss [<!ENTITY x "boom">]><rss><channel></channel></rss>')).toEqual(
      []
    )
    expect(parseFeed('<rss><channel><item><title>Open</item></channel></rss>')).toEqual([])
    expect(parseFeed('<html><body>Not a feed</body></html>')).toEqual([])
    expect(parseFeed('')).toEqual([])
  })
})

describe('friendlyAge', () => {
  const now = Date.parse('2026-09-27T15:00:00Z')
  it.each([
    ['2026-09-27T14:59:40Z', 'Just now'],
    ['2026-09-27T14:59:00Z', '1 minute ago'],
    ['2026-09-27T14:15:00Z', '45 minutes ago'],
    ['2026-09-27T14:00:00Z', '1 hour ago'],
    ['2026-09-27T10:00:00Z', '5 hours ago'],
    ['2026-09-26T12:00:00Z', 'Yesterday'],
    ['2026-09-23T12:00:00Z', '4 days ago'],
    // A clock running behind the feed isn't "in the future" to her.
    ['2026-09-27T15:30:00Z', 'Just now']
  ])('%s reads as %s', (publishedAt, text) => {
    expect(friendlyAge(publishedAt, now)).toBe(text)
  })

  it('says nothing rather than guessing when the date is missing or unreadable', () => {
    expect(friendlyAge(null, now)).toBe('')
    expect(friendlyAge('not a date', now)).toBe('')
  })
})

describe('news service', () => {
  const newsTile: Tile = {
    id: 'news-1',
    type: 'builtin',
    builtinKey: 'news',
    label: 'News',
    size: 'wide',
    colorIndex: 0,
    feedUrl: 'https://news.test/feed',
    url: 'https://news.test'
  }

  function setup(tile: Tile | undefined = newsTile): {
    service: NewsService
    fetchImpl: Mock
    log: Mock
    lookupImpl: Mock
    advance: (ms: number) => number
  } {
    let clock = Date.parse('2026-09-27T15:00:00Z')
    const log = vi.fn()
    const lookupImpl = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }])
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).startsWith('https://img.test/rose')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/jpeg' }
        })
      }
      if (String(url).startsWith('https://img.test/bread')) {
        return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
      }
      return new Response(RSS, { headers: { 'content-type': 'application/rss+xml' } })
    })
    const service = createNewsService({
      getTile: (id) => (tile?.id === id ? tile : undefined),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupImpl,
      now: () => clock,
      log
    })
    return { service, fetchImpl, log, lookupImpl, advance: (ms: number) => (clock += ms) }
  }

  function imageFeed(imageUrl: string): string {
    return `<rss><channel><item><title>News</title><link>https://news.test/story</link>
      <enclosure type="image/jpeg" url="${imageUrl}"/></item></channel></rss>`
  }

  it.each([
    'http://127.0.0.1/a',
    'http://10.0.0.1/a',
    'http://[::1]/a',
    'http://[::ffff:192.168.1.1]/a',
    'http://localhost/a',
    'http://localhost./a',
    'http://printer/a',
    'http://printer./a',
    'http://printer.localhost/a',
    'http://2130706433/a'
  ])('never connects to an internal thumbnail at %s', async (imageUrl) => {
    const { service, fetchImpl, lookupImpl, log } = setup()
    fetchImpl.mockResolvedValue(new Response(imageFeed(imageUrl)))
    const result = await service.get('news-1')
    expect(result).toMatchObject({ ok: true, stories: [{ title: 'News' }] })
    if (result.ok) expect(result.stories[0]!.thumbnail).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(lookupImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain(imageUrl)
  })

  it.each([
    { answers: [] },
    { answers: [{ address: '127.0.0.1', family: 4 }] },
    {
      answers: [
        { address: '8.8.8.8', family: 4 },
        { address: 'fd00::1', family: 6 }
      ]
    }
  ])('rejects empty or mixed non-public DNS answers: %j', async ({ answers }) => {
    const { service, fetchImpl, lookupImpl } = setup()
    lookupImpl.mockResolvedValue(answers)
    fetchImpl.mockResolvedValue(new Response(imageFeed('https://img.test/a')))
    const result = await service.get('news-1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.stories[0]!.thumbnail).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(lookupImpl).toHaveBeenCalledWith('img.test', { all: true })
  })

  it('keeps the caregiver-selected loopback feed unrestricted', async () => {
    const { service, fetchImpl, lookupImpl } = setup({
      ...newsTile,
      feedUrl: 'http://127.0.0.1/feed'
    })
    fetchImpl.mockResolvedValue(new Response(ATOM))
    expect((await service.get('news-1')).ok).toBe(true)
    expect(lookupImpl).not.toHaveBeenCalled()
  })

  it.each(['http://192.168.1.1/a', 'https://internal.test/a', 'file:///secret'])(
    'rechecks redirect destinations before connecting: %s',
    async (location) => {
      const { service, fetchImpl, lookupImpl } = setup()
      lookupImpl.mockImplementation(async (host: string) => [
        { address: host === 'img.test' ? '8.8.8.8' : '10.0.0.1', family: 4 }
      ])
      fetchImpl.mockResolvedValueOnce(new Response(imageFeed('https://img.test/a')))
      fetchImpl.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }))
      const result = await service.get('news-1')
      if (result.ok) expect(result.stories[0]!.thumbnail).toBeUndefined()
      expect(result.ok).toBe(true)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(fetchImpl.mock.calls[1]![1]).toMatchObject({ redirect: 'manual' })
    }
  )

  it('resolves the same hostname again after a relative redirect', async () => {
    const { service, fetchImpl, lookupImpl } = setup()
    lookupImpl.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
    lookupImpl.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
    fetchImpl.mockResolvedValueOnce(new Response(imageFeed('https://img.test/a')))
    fetchImpl.mockResolvedValueOnce(
      new Response(null, {
        status: 307,
        headers: { location: '/b' }
      })
    )
    const result = await service.get('news-1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.stories[0]!.thumbnail).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(lookupImpl).toHaveBeenCalledTimes(2)
  })

  it('omits an image on DNS failure without logging the failed address', async () => {
    const { service, fetchImpl, lookupImpl, log } = setup()
    lookupImpl.mockRejectedValue(new Error('DNS failed for https://img.test/private'))
    fetchImpl.mockResolvedValue(new Response(imageFeed('https://img.test/private')))
    expect(await service.get('news-1')).toMatchObject({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('news-thumbnail', 'Error')
    expect(JSON.stringify(log.mock.calls)).not.toContain('img.test')
  })

  it('keeps the thumbnail byte cap even without Content-Length', async () => {
    const { service, fetchImpl } = setup()
    fetchImpl.mockResolvedValueOnce(new Response(imageFeed('https://img.test/a')))
    fetchImpl.mockResolvedValueOnce(
      new Response(new Uint8Array(IMAGE_MAX_BYTES + 1), {
        headers: { 'content-type': 'image/png' }
      })
    )
    const result = await service.get('news-1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.stories[0]!.thumbnail).toBeUndefined()
  })

  it.each([3, 4])('allows three redirect hops but not four (%s)', async (hops) => {
    const { service, fetchImpl, lookupImpl } = setup()
    fetchImpl.mockResolvedValueOnce(new Response(imageFeed('https://img.test/0')))
    for (let i = 1; i <= hops; i++) {
      fetchImpl.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: `/${i}` } })
      )
    }
    fetchImpl.mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: { 'content-type': 'image/png' }
      })
    )
    const result = await service.get('news-1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stories[0]!.thumbnail).toBe(
        hops === 3 ? 'data:image/png;base64,AQ==' : undefined
      )
    }
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(lookupImpl).toHaveBeenCalledTimes(4)
  })

  it('bounds DNS waiting by the image deadline and keeps errors URL-free', async () => {
    vi.useFakeTimers()
    try {
      const { service, fetchImpl, lookupImpl, log } = setup()
      lookupImpl.mockImplementation(() => new Promise(() => undefined))
      fetchImpl.mockResolvedValue(new Response(imageFeed('https://img.test/a')))
      const pending = service.get('news-1')
      await vi.advanceTimersByTimeAsync(3_001)
      expect(await pending).toMatchObject({ ok: true })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('news-thumbnail', 'Thumbnail lookup timed out')
      expect(JSON.stringify(log.mock.calls)).not.toContain('img.test')
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['<?xml version="1.0" encoding="windows-1252"?>', 'application/rss+xml'],
    ['', 'application/rss+xml; charset="windows-1252"'],
    ['<?xml version="1.0" encoding="utf-8"?>', 'application/rss+xml; charset=windows-1252']
  ])('decodes legacy feed bytes from XML or HTTP charset', async (declaration, contentType) => {
    const { service, fetchImpl } = setup()
    const xml = `${declaration}<rss><channel><item><title>\x93Caf\xe9\x94</title>
      <link>https://news.test/story</link></item></channel></rss>`
    fetchImpl.mockResolvedValue(
      new Response(Buffer.from(xml, 'latin1'), {
        headers: { 'content-type': contentType }
      })
    )
    expect(await service.get('news-1')).toMatchObject({
      ok: true,
      stories: [{ title: '“Café”' }]
    })
  })

  it.each(['utf-8', 'utf-16le', 'utf-16be'])(
    'prefers a %s BOM over charset and XML',
    async (encoding) => {
      const { service, fetchImpl } = setup()
      const xml =
        '<?xml version="1.0" encoding="windows-1252"?><rss><channel><item>' +
        '<title>Café</title><link>https://news.test/story</link></item></channel></rss>'
      const bytes =
        encoding === 'utf-8' ? Buffer.from('\ufeff' + xml) : Buffer.from('\ufeff' + xml, 'utf16le')
      if (encoding === 'utf-16be') bytes.swap16()
      fetchImpl.mockResolvedValue(
        new Response(bytes, {
          headers: { 'content-type': 'application/rss+xml; charset=iso-8859-1' }
        })
      )
      expect(await service.get('news-1')).toMatchObject({ ok: true, stories: [{ title: 'Café' }] })
    }
  )

  it.each([
    ['<?xml version="1.0" encoding="unknown-label"?>', 'application/rss+xml'],
    ['', 'application/rss+xml; charset=unknown-label'],
    ['', 'application/rss+xml']
  ])('falls back to UTF-8 for unknown or absent labels', async (declaration, contentType) => {
    const { service, fetchImpl } = setup()
    fetchImpl.mockResolvedValue(
      new Response(
        declaration +
          '<rss><channel><item><title>Café</title>' +
          '<link>https://news.test/story</link></item></channel></rss>',
        { headers: { 'content-type': contentType } }
      )
    )
    expect(await service.get('news-1')).toMatchObject({ ok: true, stories: [{ title: 'Café' }] })
  })

  it('fetches the saved feed once, inlines raster thumbnails, and serves the cache', async () => {
    const { service, fetchImpl } = setup()
    const first = await service.get('news-1')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.stale).toBe(false)
    expect(first.stories[0]!.thumbnail).toBe('data:image/jpeg;base64,AQID')
    // SVG is a document, not a passive picture: no thumbnail.
    expect(first.stories[1]!.thumbnail).toBeUndefined()
    expect(JSON.stringify(first)).not.toContain('imageUrl')
    const calls = fetchImpl.mock.calls.length
    await service.get('news-1')
    expect(fetchImpl.mock.calls.length).toBe(calls)
  })

  it('keeps the last good stories, marked stale, when a refresh fails', async () => {
    const { service, fetchImpl, advance } = setup()
    await service.get('news-1')
    advance(NEWS_CACHE_MS + 1)
    fetchImpl.mockRejectedValue(new TypeError('fetch failed'))
    const result = await service.get('news-1')
    expect(result).toMatchObject({ ok: true, stale: true })
  })

  it('refuses feeds that are too large, and never logs the feed address', async () => {
    const { service, fetchImpl, log } = setup()
    fetchImpl.mockResolvedValue(
      new Response('x', { headers: { 'content-length': String(FEED_MAX_BYTES + 1) } })
    )
    expect(await service.get('news-1')).toEqual({ ok: false })
    expect(log).toHaveBeenCalledWith('news-feed', 'Response too large')
    expect(JSON.stringify(log.mock.calls)).not.toContain('news.test')
  })

  it('fetches nothing for a tile that is not a News tile with an http(s) feed', async () => {
    for (const tile of [
      { ...newsTile, feedUrl: 'file:///C:/secrets.xml' },
      { ...newsTile, builtinKey: 'weather' },
      { ...newsTile, type: 'web' as const }
    ]) {
      const { service, fetchImpl } = setup(tile)
      expect(await service.get('news-1')).toEqual({ ok: false })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('opens only the saved site or a story it actually served', async () => {
    const { service } = setup()
    expect(service.destination('news-1')).toBe('https://news.test/')
    expect(service.destination('news-1', 'https://news.test/garden')).toBeNull()
    await service.get('news-1')
    expect(service.destination('news-1', 'https://news.test/garden')).toBe(
      'https://news.test/garden'
    )
    expect(service.destination('news-1', 'https://evil.test/')).toBeNull()
    expect(service.destination('other', 'https://news.test/garden')).toBeNull()
  })
})
