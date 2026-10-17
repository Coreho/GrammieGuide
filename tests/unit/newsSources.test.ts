import { describe, expect, it, vi } from 'vitest'
import { configSchema, defaultConfig, type Tile } from '../../src/shared/configSchema'
import { DEFAULT_NEWS_SOURCES, newsSourceFor } from '../../src/shared/news/sources'
import { tileSites } from '../../src/shared/browser/approvedSites'
import { runMigrations } from '../../src/main/config/migrations/runner'
import { createNewsPreviewService } from '../../src/main/services/news/newsPreviewService'
import { createNewsService } from '../../src/main/services/news/newsService'

const tile: Tile = {
  id: 'news',
  type: 'builtin',
  builtinKey: 'news',
  label: 'News',
  colorIndex: 0,
  size: 'wide',
  slot: 0,
  newsSources: DEFAULT_NEWS_SOURCES.map((source) => ({ ...source }))
}

describe('News website sources', () => {
  it('uses the approved order and approves only saved source hosts', () => {
    expect(DEFAULT_NEWS_SOURCES.map((source) => source.label)).toEqual([
      'Yahoo News',
      'BBC News',
      'NBC News'
    ])
    expect(tileSites([tile])).toEqual(['yahoo.com', 'bbc.com', 'nbcnews.com'])
    expect(newsSourceFor(tile, 'bbc')?.url).toBe('https://www.bbc.com/news')
    expect(newsSourceFor(tile, 'https://unapproved.test')).toBeUndefined()
    expect(newsSourceFor({ ...tile, type: 'web' }, 'bbc')).toBeUndefined()
  })

  it('rejects executable addresses, credentials, empty choices and duplicate source IDs', () => {
    for (const newsSources of [
      [],
      [{ id: 'x', label: 'Bad', url: 'javascript:alert(1)' }],
      [{ id: 'x', label: 'Bad', url: 'https://name:secret@example.com/' }],
      [DEFAULT_NEWS_SOURCES[0], DEFAULT_NEWS_SOURCES[0]]
    ]) {
      expect(
        configSchema.safeParse({ ...defaultConfig(), tiles: [{ ...tile, newsSources }] }).success
      ).toBe(false)
    }
  })

  it('upgrades old configs without replacing a caregiver-saved feed', () => {
    const legacy = {
      ...tile,
      newsSources: undefined,
      feedUrl: 'https://local.test/rss',
      url: 'https://local.test'
    }
    const input = { ...defaultConfig(), schemaVersion: 15, tiles: [legacy] }
    const copy = structuredClone(input)
    const result = runMigrations(input)
    expect(result.ok).toBe(true)
    expect(result.config.tiles[0]).toMatchObject(legacy)
    expect(input).toEqual(copy)
  })

  it('opens only a saved source ID, never a supplied URL or a source/story mixture', () => {
    const service = createNewsService({
      getTile: (id) => (id === tile.id ? tile : undefined),
      log: vi.fn()
    })
    expect(service.destination('news', undefined, 'bbc')).toBe('https://www.bbc.com/news')
    expect(service.destination('news', undefined, 'https://unapproved.test')).toBeNull()
    expect(service.destination('other', undefined, 'bbc')).toBeNull()
    expect(service.destination('news', 'story', 'bbc')).toBeNull()
    expect(service.destination('news')).toBeNull()
  })
})

describe('News preview cache', () => {
  it('serializes work and limits the pending queue before creating more preview pages', async () => {
    const image = 'data:image/jpeg;base64,cHJldmlldw=='
    let release: (image: string) => void = () => undefined
    const blocked = new Promise<string>((resolve) => {
      release = resolve
    })
    const capture = vi
      .fn<(_: string) => Promise<string>>()
      .mockReturnValueOnce(blocked)
      .mockResolvedValue(image)
    const service = createNewsPreviewService({ getTile: () => tile, capture })
    const jobs = Array.from({ length: 7 }, (_, index) => service.get(`tile-${index}`, 'bbc'))
    await Promise.resolve()
    expect(capture).toHaveBeenCalledTimes(1)
    expect(await jobs[6]).toEqual({})
    release(image)
    await Promise.all(jobs)
    expect(capture).toHaveBeenCalledTimes(6)
  })

  it('deduplicates concurrent requests, caches screenshots and rejects unknown sources', async () => {
    const capture = vi.fn(async () => 'data:image/jpeg;base64,cHJldmlldw==')
    const service = createNewsPreviewService({ getTile: () => tile, capture })
    const [first, second] = await Promise.all([
      service.get('news', 'bbc'),
      service.get('news', 'bbc')
    ])
    expect(first.image).toBeTruthy()
    expect(second).toEqual(first)
    expect(await service.get('news', 'bbc')).toEqual(first)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(await service.get('news', 'https://unapproved.test')).toEqual({})
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('keeps a last good preview on failure, retries later and invalidates edited destinations', async () => {
    let now = 100
    let current = structuredClone(tile)
    const capture = vi
      .fn<(_: string) => Promise<string>>()
      .mockResolvedValueOnce('data:image/jpeg;base64,cHJldmlldw==')
      .mockRejectedValue(new Error('offline'))
    const service = createNewsPreviewService({ getTile: () => current, capture, now: () => now })
    const first = await service.get('news', 'bbc')
    now += 16 * 60_000
    expect(await service.get('news', 'bbc')).toEqual(first)
    expect(await service.get('news', 'bbc')).toEqual(first)
    expect(capture).toHaveBeenCalledTimes(2)
    current = {
      ...current,
      newsSources: current.newsSources!.map((source) => ({
        ...source,
        url: 'https://different.test/'
      }))
    }
    expect(await service.get('news', 'bbc')).toEqual({})
    expect(capture).toHaveBeenLastCalledWith('https://different.test/')
  })

  it('bounds screenshot payloads and does not leak a preview after its source is removed', async () => {
    let current: Tile | undefined = tile
    const capture = vi.fn(async () => {
      current = undefined
      return 'data:image/jpeg;base64,cHJldmlldw=='
    })
    const service = createNewsPreviewService({ getTile: () => current, capture })
    expect(await service.get('news', 'bbc')).toEqual({})
    const oversized = createNewsPreviewService({
      getTile: () => tile,
      capture: async () => 'data:image/jpeg;base64,' + 'x'.repeat(500_000)
    })
    expect(await oversized.get('news', 'bbc')).toEqual({})
  })
})
