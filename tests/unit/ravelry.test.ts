import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_RAVELRY_PICTURES,
  htmlToPlainText,
  parseRavelryLastPage,
  parseRavelryPattern,
  parseRavelryPatternPage,
  parseRavelrySearch,
  type RavelryPatternDetails
} from '../../src/shared/knitting/ravelry'
import { knittingFileSchema } from '../../src/shared/knitting/knitting'

// Captured from api.ravelry.com with a read-only key on 2026-11-01, then trimmed: people's public
// profile details and most of the designer's notes removed, every field the app reads kept as sent.
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ravelry', name), 'utf8'))
const pattern = (fields: Record<string, unknown>): unknown => ({
  pattern: { id: 5, name: 'Scarf', ...fields }
})

describe('Ravelry search replies', () => {
  it('keeps what the caregiver chooses from', () => {
    const found = parseRavelrySearch(fixture('search.json'))!
    expect(found).toHaveLength(3)
    expect(found[0]).toEqual({
      ravelryId: 1359829,
      name: 'Sweet Shop Blanket',
      designer: 'Laura Penrose',
      thumbnailSource:
        'https://images4-f.ravelrycache.com/uploads/PenroseKnits/942623264/bed2_small.jpg',
      pictureSource:
        'https://images4-g.ravelrycache.com/uploads/PenroseKnits/942623264/bed2_medium.jpg'
    })
    // Real pictures aren't all JPEGs: this one is a PNG, and its small name differs too.
    expect(found[2]!.thumbnailSource).toBe(
      'https://images4-g.ravelrycache.com/uploads/SnufflebeanYarn/916975337/diagonal_knit_blogger_small_best_fit.png'
    )
  })

  it('skips one bad entry and refuses a reply that is not a list', () => {
    expect(
      parseRavelrySearch({ patterns: [{ id: 'x' }, { id: 2, name: '  ' }, { id: 3, name: 'Hat' }] })
    ).toEqual([{ ravelryId: 3, name: 'Hat', designer: '' }])
    expect(parseRavelrySearch({ patterns: 'nope' })).toBeNull()
    expect(parseRavelrySearch(null)).toBeNull()
  })

  it('never keeps a picture address that is not https', () => {
    const [found] = parseRavelrySearch({
      patterns: [
        { id: 1, name: 'Hat', first_photo: { small_url: 'http://images.example.com/a.jpg' } }
      ]
    })!
    expect(found).toEqual({ ravelryId: 1, name: 'Hat', designer: '' })
    const [script] = parseRavelrySearch({
      patterns: [{ id: 1, name: 'Hat', first_photo: { small_url: 'javascript:alert(1)' } }]
    })!
    expect(script).not.toHaveProperty('thumbnailSource')
  })
})

describe('Ravelry pattern replies', () => {
  it('keeps plain words, the facts she needs, and the largest pictures', () => {
    const details = parseRavelryPattern(fixture('pattern.json'))!
    expect(details).toMatchObject({
      ravelryId: 1359829,
      name: 'Sweet Shop Blanket',
      designer: 'Laura Penrose',
      facts: [
        { label: 'Yarn', value: 'DK (11 wpi)' },
        // Ravelry sends "US 6  - 4.0 mm" with a double space, and a trailing space on sizes.
        { label: 'Needles', value: 'US 6 - 4.0 mm' },
        { label: 'Yardage', value: '2078 - 8661 yards' },
        { label: 'Sizes', value: 'baby/pet, lap, throw, bedspread' },
        {
          label: 'Gauge',
          value:
            '23 stitches and 40 rows = 4 inches in garter stitch with two strands of yarn held together, blocked'
        }
      ]
    })
    expect(details.notes).toBe(
      [
        'Gauge: 23 sts x 40 rows = 10 x 10cm / 4 x 4” Garter Stitch worked flat, blocked',
        'Yarn: Dk weight yarn or Light Fingering held double or any weight yarn preferred',
        'Needles: 4mm straight or circular needle, or needle required to meet gauge',
        'Accessories: embroidery needle, scissors, weighing scales'
      ].join('\n')
    )
    // The real pattern has more photos than she needs; the largest size of the first few.
    expect(details.pictureUrls).toHaveLength(MAX_RAVELRY_PICTURES)
    expect(details.pictureUrls.every((url) => /_medium2\./.test(url))).toBe(true)
  })

  it('accepts needles documented as a string, and falls back to raw notes', () => {
    const details = parseRavelryPattern(
      pattern({ pattern_needle_sizes: 'US 7', notes: 'Line one\r\n\r\n\r\nLine two' })
    )!
    expect(details.facts).toEqual([{ label: 'Needles', value: 'US 7' }])
    expect(details.notes).toBe('Line one\n\nLine two')
  })

  it('loses only the odd field when one field has an unexpected type', () => {
    const details = parseRavelryPattern(
      pattern({ notes_html: 42, gauge_description: {}, photos: 'none', pattern_author: 'Ann' })
    )!
    expect(details).toEqual({
      ravelryId: 5,
      name: 'Scarf',
      designer: '',
      facts: [],
      notes: '',
      pictureUrls: []
    })
  })

  it('refuses a reply with no readable pattern', () => {
    expect(parseRavelryPattern({ patterns: [] })).toBeNull()
    expect(parseRavelryPattern({ pattern: { id: 'x', name: 'Scarf' } })).toBeNull()
    expect(parseRavelryPattern({ pattern: { id: 5, name: '' } })).toBeNull()
    expect(parseRavelryPattern('<html>')).toBeNull()
  })

  it('ends long notes at a sentence, not part-way through a thought', () => {
    const details = parseRavelryPattern(
      pattern({ notes_html: `<p>${'Knit one row of this. '.repeat(400)}</p>` })
    )!
    expect(details.notes.length).toBeLessThanOrEqual(3000)
    expect(details.notes.endsWith('Knit one row of this.')).toBe(true)
  })

  it('bounds everything it keeps, so a huge reply fits the knitting file', () => {
    const details = parseRavelryPattern(
      pattern({
        name: 'N'.repeat(500),
        pattern_author: { name: 'D'.repeat(500) },
        notes_html: `<p>${'word '.repeat(5000)}</p>`,
        gauge_description: 'G'.repeat(500),
        photos: Array.from({ length: 40 }, (_, i) => ({
          medium_url: `https://images.example.com/${i}.jpg`
        }))
      })
    )!
    expect(details.pictureUrls).toHaveLength(MAX_RAVELRY_PICTURES)
    const saved = knittingFileSchema.parse({
      version: 1,
      project: null,
      ravelry: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          ravelryId: details.ravelryId,
          name: details.name,
          designer: details.designer,
          facts: details.facts,
          notes: details.notes,
          pictures: []
        }
      ]
    })
    expect(saved.ravelry[0]!.notes.endsWith('…')).toBe(true)
  })
})

describe('notes as plain text', () => {
  it('drops tags and scripts, so nothing from Ravelry can reach Home as markup', () => {
    expect(
      htmlToPlainText(
        '<p onclick="x()">Hi<script>alert(1)</script><br>there<img src=x onerror=alert(1)></p><style>p{}</style>'
      )
    ).toBe('Hi\nthere')
  })

  it('decodes entities into words without inventing tags it then trusts', () => {
    expect(htmlToPlainText('5&nbsp;mm &amp; 6&#160;mm &#x2014; caf&eacute;')).toBe(
      '5 mm & 6 mm — caf&eacute;'
    )
    // Stays visible text; Home renders it as a text node, so it can't become an element.
    expect(htmlToPlainText('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>')
    expect(htmlToPlainText('bad &#xFFFFFFF; number')).toBe('bad number')
  })

  it('strips invisible characters that could reorder or hide what she reads', () => {
    expect(htmlToPlainText('safe‮text​ here\u0007')).toBe('safetext here')
  })

  it('turns only real breaks into new lines', () => {
    expect(htmlToPlainText('<p>one\ntwo</p>\n\n\n<p>three</p><ul><li>a</li></ul>')).toBe(
      'one two\n\nthree\n\n• a'
    )
    expect(htmlToPlainText('<ul><li>a</li>\n<li>b</li></ul><p>c</p>')).toBe('• a\n• b\n\nc')
  })
})

describe('the knitting file', () => {
  it('reads files saved before Ravelry picks existed', () => {
    expect(knittingFileSchema.parse({ version: 1, project: null }).ravelry).toEqual([])
  })
})

describe('a Ravelry pattern page address', () => {
  it('gives the pattern name only for a pattern page on Ravelry itself', () => {
    const page = parseRavelryPatternPage
    expect(page('https://www.ravelry.com/patterns/library/sweet-shop-blanket')).toBe(
      'sweet-shop-blanket'
    )
    expect(page('https://ravelry.com/patterns/library/hat-2/')).toBe('hat-2')
    expect(page('https://www.ravelry.com/patterns/library/hat?buy=1')).toBe('hat')
    for (const other of [
      null,
      undefined,
      'not a url',
      'http://www.ravelry.com/patterns/library/hat',
      'https://www.ravelry.com/patterns/search',
      'https://www.ravelry.com/patterns/library/',
      'https://www.ravelry.com/patterns/library/hat/comments',
      'https://www.ravelry.com/patterns/library/..%2f..%2fcurrent_user',
      'https://ravelry.com.evil.example/patterns/library/hat',
      'https://evil.example/patterns/library/hat'
    ]) {
      expect(page(other)).toBeNull()
    }
  })
})

describe('instructions and page counts in replies', () => {
  const download = { url: 'https://designer.example.com/hat.pdf' }

  it('offers an instructions address only for a free pattern', () => {
    const details = (fields: Record<string, unknown>): RavelryPatternDetails =>
      parseRavelryPattern(pattern(fields))!
    expect(details({ free: true, download_location: download }).instructionsUrl).toBe(download.url)
    expect(details({ free: false, download_location: download })).not.toHaveProperty(
      'instructionsUrl'
    )
    expect(details({ download_location: download })).not.toHaveProperty('instructionsUrl')
    expect(details({ free: true, download_location: null })).not.toHaveProperty('instructionsUrl')
  })

  it('upgrades Ravelry links, which the real API lists as http, so her sign-in stays encrypted', () => {
    const details = (url: string): RavelryPatternDetails =>
      parseRavelryPattern(pattern({ free: true, download_location: { url } }))!
    expect(details('http://www.ravelry.com/dls/79598/634788').instructionsUrl).toBe(
      'https://www.ravelry.com/dls/79598/634788'
    )
    expect(details('http://designer.example.com/hat.pdf').instructionsUrl).toBe(
      'http://designer.example.com/hat.pdf'
    )
    for (const bad of ['javascript:alert(1)', 'file:///c:/secret.pdf', 'not an address']) {
      expect(details(bad)).not.toHaveProperty('instructionsUrl')
    }
  })

  it('treats a reply with no usable page count as one page', () => {
    expect(parseRavelryLastPage({ paginator: { last_page: 7 } })).toBe(7)
    expect(parseRavelryLastPage({})).toBe(1)
    expect(parseRavelryLastPage({ paginator: { last_page: 'lots' } })).toBe(1)
  })
})
