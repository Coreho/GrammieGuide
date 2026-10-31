import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  defaultConfig,
  configSchema,
  type Tile
} from '../../src/shared/configSchema'
import {
  MAX_APPROVED_SITES,
  normalizeSite,
  navigationAllowed,
  tileSites
} from '../../src/shared/browser/approvedSites'
import { createBlockedSites, MAX_BLOCKED_SITES } from '../../src/main/services/browser/blockedSites'
import { migration } from '../../src/main/config/migrations/014-approved-sites'
import { runMigrations } from '../../src/main/config/migrations/runner'
import { applyConfigPatch } from '../../src/main/config/applyConfigPatch'

const tile = (url: string): Tile => ({
  id: 'web',
  label: 'Site',
  type: 'web',
  url,
  slot: 0,
  size: 'normal',
  colorIndex: 0
})
const config = {
  tiles: [tile('https://www.bbc.co.uk/news')],
  approvedSites: ['example.com', '127.0.0.1', '[::1]']
}

describe('the Ravelry switch on a Knitting tile', () => {
  const knitting = (fields: Partial<Tile>): Tile => ({
    id: 'knitting',
    label: 'Knitting',
    type: 'builtin',
    builtinKey: 'knitting',
    slot: 0,
    size: 'normal',
    colorIndex: 0,
    ...fields
  })
  const on = { tiles: [knitting({ ravelry: true })], approvedSites: [] }

  it.each([
    'https://www.ravelry.com/',
    'https://ravelry.com/patterns',
    'https://api.ravelry.com/a'
  ])('allows %s when on', (url) => {
    expect(navigationAllowed(url, on, 'open')).toBe(true)
    expect(navigationAllowed(url, on, 'navigate')).toBe(true)
  })

  it.each([
    'https://ravelry.com.example.org/',
    'https://notravelry.com/',
    'https://www.example.com/',
    'https://www.ravelry.com@example.org/'
  ])('still refuses %s when on', (url) => {
    expect(navigationAllowed(url, on, 'navigate')).toBe(false)
  })

  it('approves nothing while off, unset, or on any other tile', () => {
    expect(tileSites([knitting({ ravelry: false })])).toEqual([])
    expect(tileSites([knitting({})])).toEqual([])
    expect(tileSites([knitting({ ravelry: true, builtinKey: 'music' })])).toEqual([])
    expect(tileSites([{ ...tile('https://example.com'), type: 'app', ravelry: true }])).toEqual([])
    expect(
      navigationAllowed(
        'https://www.ravelry.com/',
        { tiles: [knitting({})], approvedSites: [] },
        'open'
      )
    ).toBe(false)
  })

  it('never takes an address from the tile', () => {
    expect(tileSites([knitting({ ravelry: true, url: 'https://example.com' })])).toEqual([
      'ravelry.com'
    ])
    expect(tileSites([knitting({ url: 'https://example.com' })])).toEqual([])
  })

  it('survives a config save, and a tile from before it stays valid', () => {
    const saved = applyConfigPatch(defaultConfig(), { tiles: [knitting({ ravelry: true })] })
    expect(saved.ok && saved.config.tiles[0]?.ravelry).toBe(true)
    const older = applyConfigPatch(defaultConfig(), { tiles: [knitting({})] })
    expect(older.ok).toBe(true)
    expect(older.ok && older.config.tiles[0]?.ravelry).toBeUndefined()
  })
})

describe('approved site matching', () => {
  it.each([
    'https://bbc.co.uk',
    'https://WWW.BBC.CO.UK:443/news',
    'http://video.bbc.co.uk:8080/a',
    'https://BBC.CO.UK./a',
    'https://example.com:8443',
    'http://a.example.com',
    'http://127.0.0.1:8000',
    'http://[::1]:9000'
  ])('allows %s', (url) => {
    expect(navigationAllowed(url, config, 'navigate')).toBe(true)
  })
  it.each([
    'https://other.co.uk',
    'https://notbbc.co.uk',
    'https://bbc.co.uk.evil.com',
    'https://evil-example.com',
    'http://127.0.0.2',
    'http://[::2]',
    'https://example.com@evil.com',
    'https://user:secret@example.com',
    'https://example.com:99999',
    'https://',
    'example.com',
    'https:example.com',
    'https://example.com\\@evil.com',
    'https://exa mple.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/a',
    'https://[invalid]'
  ])('blocks %s', (url) => {
    expect(navigationAllowed(url, config, 'navigate')).toBe(false)
  })
  it('removes only www, keeps other labels, and reads the current tile list', () => {
    const cfg = {
      tiles: [tile('https://www.bbc.co.uk'), tile('https://shop.example.com')],
      approvedSites: []
    }
    expect(tileSites(cfg.tiles)).toEqual(['bbc.co.uk', 'shop.example.com'])
    expect(navigationAllowed('https://example.com', cfg, 'navigate')).toBe(false)
    cfg.tiles = []
    expect(navigationAllowed('https://bbc.co.uk', cfg, 'navigate')).toBe(false)
    expect(tileSites([{ ...tile('https://example.com'), type: 'app' }])).toEqual([])
    expect(
      tileSites([{ ...tile('https://example.com'), type: 'builtin', builtinKey: 'news' }])
    ).toEqual(['example.com'])
  })
  it.each(['com', 'www.com', 'co.uk', 'www.co.uk', 'com.au', 'org.nz', 'github.io', 'pages.dev'])(
    'never expands the suffix %s into an approval',
    (site) => {
      expect(normalizeSite(site)).toBeNull()
      expect(
        navigationAllowed(
          // A neighbour under the same ending, not a page on the tile's own host.
          `https://other.${site.replace(/^www\./, '')}`,
          { tiles: [tile(`https://${site}`)], approvedSites: [] },
          'open'
        )
      ).toBe(false)
      expect(
        navigationAllowed(
          `https://other.${site.replace(/^www./, '')}`,
          { tiles: [], approvedSites: [site] },
          'open'
        )
      ).toBe(false)
    }
  )
  it.each(['www.cbc.ca', 'nos.nl', 'www.web.de', 'orf.at', 'www.rte.ie'])(
    'approves a short real site under a country code: %s',
    (host) => {
      const cfg = { tiles: [tile(`https://${host}/news`)], approvedSites: [] }
      expect(navigationAllowed(`https://${host}/story`, cfg, 'navigate')).toBe(true)
      expect(normalizeSite(host.replace(/^www\./, ''))).toBe(host.replace(/^www\./, ''))
    }
  )
  it('keeps www when removing it would leave only a shared ending', () => {
    const cfg = { tiles: [tile('https://www.gov.uk/browse')], approvedSites: [] }
    expect(tileSites(cfg.tiles)).toEqual(['www.gov.uk'])
    expect(navigationAllowed('https://www.gov.uk/pension', cfg, 'navigate')).toBe(true)
    expect(navigationAllowed('https://scam.gov.uk', cfg, 'navigate')).toBe(false)
    expect(navigationAllowed('https://evil.co.uk', cfg, 'navigate')).toBe(false)
  })
  it('handles hostname case, IP canonicalization and explicit localhost', () => {
    expect(normalizeSite('WWW.Example.COM')).toBe('example.com')
    expect(normalizeSite('[0:0:0:0:0:0:0:1]')).toBe('[::1]')
    expect(
      navigationAllowed(
        'http://localhost:9000',
        { tiles: [], approvedSites: ['localhost'] },
        'open'
      )
    ).toBe(true)
    expect(
      navigationAllowed(
        'http://evil.localhost',
        { tiles: [], approvedSites: ['localhost'] },
        'open'
      )
    ).toBe(false)
  })
})

describe('main-document decisions and News exception', () => {
  const story = 'https://story.example/article?id=private'
  const cfg = { tiles: [], approvedSites: ['approved.example'] }
  it.each(['open', 'retry', 'back'] as const)(
    'allows only the exact served story for %s',
    (kind) => {
      expect(navigationAllowed(story, cfg, kind, story)).toBe(true)
      expect(navigationAllowed(`${story}2`, cfg, kind, story)).toBe(false)
      expect(navigationAllowed(story, cfg, kind)).toBe(false)
    }
  )
  it.each(['navigate', 'redirect'] as const)('requires normal approval for a story %s', (kind) => {
    for (const url of [story, 'https://story.example/another', 'https://evil.example']) {
      expect(navigationAllowed(url, cfg, kind, story)).toBe(false)
    }
    expect(navigationAllowed('https://approved.example/next', cfg, kind, story)).toBe(true)
  })
  it('even trusted pages must be valid web URLs', () => {
    expect(navigationAllowed('file:///story', cfg, 'open', 'file:///story')).toBe(false)
  })
})

describe('approved sites config and migration 014', () => {
  it('defaults to an empty list and saves normalized hostnames through the normal patch path', () => {
    expect(defaultConfig().approvedSites).toEqual([])
    const result = applyConfigPatch(defaultConfig(), { approvedSites: ['WWW.Example.COM'] })
    expect(result.ok && result.config.approvedSites).toEqual(['example.com'])
  })
  it.each([
    '',
    'https://example.com',
    'example.com/path',
    'example.com:443',
    '*.example.com',
    'bad_host.com',
    '-bad.com',
    'bad-.com',
    'example..com',
    'example.com.',
    'example.com?secret',
    'user@example.com',
    ' example.com',
    '999.0.0.1',
    '127.00.0.1',
    '1234',
    'co.uk',
    'a'.repeat(64) + '.com',
    'a.'.repeat(126) + 'com'
  ])('drops %s instead of failing the whole saved config', (site) => {
    // A config that fails validation resets her Home at boot, so a bad entry is dropped.
    const parsed = configSchema.safeParse({
      ...defaultConfig(),
      approvedSites: [site, 'good.example']
    })
    expect(parsed.success && parsed.data.approvedSites).toEqual(['good.example'])
  })
  it('bounds the number of approvals and total hostname length', () => {
    const sites = Array.from({ length: MAX_APPROVED_SITES }, (_, i) => `site${i}.example`)
    expect(applyConfigPatch(defaultConfig(), { approvedSites: sites }).ok).toBe(true)
    const over = applyConfigPatch(defaultConfig(), { approvedSites: [...sites, 'extra.example'] })
    expect(over.ok && over.config.approvedSites).toHaveLength(MAX_APPROVED_SITES)
    const longest = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.')
    expect(longest.length).toBe(253)
    expect(normalizeSite(longest)).toBe(longest)
    expect(normalizeSite(longest + 'd')).toBeNull()
  })
  it('adds only the list and version; existing values win without mutating the input', () => {
    const { approvedSites: _sites, ...old } = defaultConfig()
    const raw = { ...old, schemaVersion: 13 }
    const before = structuredClone(raw)
    expect(migration.migrate(raw)).toEqual({ ...raw, schemaVersion: 14, approvedSites: [] })
    expect(raw).toEqual(before)
    const existing = { ...raw, approvedSites: ['saved.example'] }
    expect(migration.migrate(existing)).toEqual({ ...existing, schemaVersion: 14 })
    const result = runMigrations(existing)
    expect(result.ok).toBe(true)
    expect(result.config).toEqual({ ...existing, schemaVersion: CURRENT_SCHEMA_VERSION })
    expect(runMigrations(result.config).config).toEqual(result.config)
  })
})

describe('blocked domain history', () => {
  it('keeps only domains, deduplicates and bounds its session-only history', () => {
    const history = createBlockedSites()
    history.record('https://example.com/private?secret=1')
    history.record('https://example.com/other')
    expect(history.list()).toEqual(['example.com'])
    history.record('not a URL')
    for (let i = 0; i < 60; i++) history.record(`https://site${i}.example/private`)
    expect(history.list()).toHaveLength(MAX_BLOCKED_SITES)
    expect(history.list()[0]).toBe('site59.example')
    expect(history.list()).not.toContain('example.com')
    history.list().push('cannot-mutate.example')
    expect(history.list()).not.toContain('cannot-mutate.example')
  })
})
