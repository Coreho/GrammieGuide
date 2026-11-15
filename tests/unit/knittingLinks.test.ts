import { describe, expect, it } from 'vitest'
import { configSchema, defaultConfig, type Tile } from '../../src/shared/configSchema'
import {
  KNITTING_LINK_LABEL_MAX,
  MAX_KNITTING_LINKS,
  knittingLinkSchema,
  type KnittingLink
} from '../../src/shared/knitting/knittingLinks'
import { navigationAllowed, tileSites } from '../../src/shared/browser/approvedSites'
import { applyConfigPatch } from '../../src/main/config/applyConfigPatch'

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const link = (
  n: number,
  url = `https://site${n}.example.org/`,
  label = `Link ${n}`
): KnittingLink => ({ id: id(n), label, url })
const knitting = (fields: Partial<Tile> & Record<string, unknown>): Tile => ({
  id: 'knitting',
  label: 'Knitting',
  type: 'builtin',
  builtinKey: 'knitting',
  slot: 0,
  size: 'normal',
  colorIndex: 0,
  ...fields
})

describe('a saved knitting link', () => {
  it('keeps a trimmed name and a normalized address', () => {
    const parsed = knittingLinkSchema.parse({
      id: id(1),
      label: '  Cable stitch video  ',
      url: ' HTTPS://WWW.YouTube.com/watch?v=abc '
    })
    expect(parsed).toEqual({
      id: id(1),
      label: 'Cable stitch video',
      url: 'https://www.youtube.com/watch?v=abc'
    })
  })

  it.each([
    ['an empty name', { label: '   ' }, 'Give the link a short name.'],
    [
      'a long name',
      { label: 'x'.repeat(KNITTING_LINK_LABEL_MAX + 1) },
      `Keep the name to ${KNITTING_LINK_LABEL_MAX} characters.`
    ],
    ['a file address', { url: 'file:///C:/Users/a.html' }, 'complete http:// or https://'],
    ['a script', { url: 'javascript:alert(1)' }, 'complete http:// or https://'],
    ['part of an address', { url: 'youtube.com/watch?v=abc' }, 'complete http:// or https://'],
    ['a username and password', { url: 'https://me:pw@example.org/' }, 'without a username'],
    ['a huge address', { url: `https://example.org/${'a'.repeat(2048)}` }, 'too long']
  ])('refuses %s with a plain message', (_name, change, message) => {
    const result = knittingLinkSchema.safeParse({ ...link(1), ...change })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain(message)
  })
})

describe('knitting links in her config', () => {
  const parse = (knittingLinks: unknown): Tile['knittingLinks'] => {
    const config = defaultConfig()
    const parsed = configSchema.safeParse({
      ...config,
      tiles: [knitting({ knittingLinks })]
    })
    expect(parsed.success).toBe(true)
    return parsed.data?.tiles[0]?.knittingLinks
  }

  it('drops a broken or repeated entry instead of failing her whole config at boot', () => {
    expect(
      parse([link(1), { ...link(2), url: 'ftp://example.org/' }, link(1), 'nonsense', link(3)])
    ).toEqual([link(1), link(3)])
  })

  it('keeps the first eight', () => {
    const many = Array.from({ length: MAX_KNITTING_LINKS + 3 }, (_, n) => link(n + 1))
    expect(parse(many)).toEqual(many.slice(0, MAX_KNITTING_LINKS))
  })

  it('treats a list that is not a list as no links', () => {
    expect(parse('https://example.org/')).toBeUndefined()
    expect(parse({ 0: link(1) })).toBeUndefined()
  })

  it('survives a config save, and a tile from before it stays valid', () => {
    const saved = applyConfigPatch(defaultConfig(), {
      tiles: [knitting({ knittingLinks: [link(1), link(2)] })]
    })
    expect(saved.ok && saved.config.tiles[0]?.knittingLinks).toEqual([link(1), link(2)])
    const older = applyConfigPatch(defaultConfig(), { tiles: [knitting({})] })
    expect(older.ok && older.config.tiles[0]?.knittingLinks).toBeUndefined()
  })
})

describe('the approved-sites rule for knitting links', () => {
  const saved = {
    tiles: [
      knitting({
        knittingLinks: [
          link(1, 'https://www.youtube.com/watch?v=abc'),
          link(2, 'https://www.garnstudio.com/pattern.php?id=1')
        ]
      })
    ],
    approvedSites: []
  }

  it.each([
    'https://www.youtube.com/watch?v=other',
    'https://m.youtube.com/shorts/abc',
    'https://garnstudio.com/',
    'https://www.garnstudio.com/videos'
  ])('allows %s on the sites she was given', (url) => {
    expect(navigationAllowed(url, saved, 'open')).toBe(true)
    expect(navigationAllowed(url, saved, 'navigate')).toBe(true)
  })

  it.each([
    'https://www.example.com/',
    'https://youtube.com.example.org/',
    'https://notyoutube.com/',
    'https://www.youtube.com@example.org/'
  ])('still refuses %s', (url) => {
    expect(navigationAllowed(url, saved, 'navigate')).toBe(false)
  })

  it('approves each saved site alongside the Ravelry switch', () => {
    expect(tileSites([knitting({ ravelry: true, knittingLinks: [link(1)] })])).toEqual([
      'ravelry.com',
      'site1.example.org'
    ])
  })

  it('approves nothing from links on any other tile, or once a link is removed', () => {
    expect(tileSites([knitting({ builtinKey: 'music', knittingLinks: [link(1)] })])).toEqual([])
    expect(
      tileSites([
        {
          id: 'app',
          label: 'App',
          type: 'app',
          slot: 1,
          size: 'normal',
          colorIndex: 0,
          knittingLinks: [link(1)]
        }
      ])
    ).toEqual([])
    expect(tileSites([knitting({ knittingLinks: [] })])).toEqual([])
    expect(
      navigationAllowed(
        'https://site1.example.org/',
        { tiles: [knitting({ knittingLinks: [link(2)] })], approvedSites: [] },
        'open'
      )
    ).toBe(false)
  })
})
