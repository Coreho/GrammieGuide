import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRavelryHomeBrowse } from '../../src/main/services/ravelry/homeBrowse'
import { RAVELRY_CATEGORIES } from '../../src/shared/knitting/ravelry'

const ITEM = {
  ravelryId: 7,
  name: 'Hat',
  designer: 'Ann',
  thumbnailUrl: 'data:image/jpeg;base64,x'
}
const DETAILS = {
  ravelryId: 7,
  name: 'Hat',
  designer: 'Ann',
  facts: [],
  notes: 'Words',
  pictureUrls: ['https://images.example.com/a.jpg', 'https://images.example.com/b.jpg']
}

const source = {
  browse: vi.fn(async () => ({ items: [ITEM], lastPage: 3 })),
  pattern: vi.fn(async () => DETAILS),
  picture: vi.fn(async () => ({ bytes: new Uint8Array([1, 2]), mime: 'image/jpeg' }))
}
let clock: number
const browse = (): ReturnType<typeof createRavelryHomeBrowse> =>
  createRavelryHomeBrowse(source, () => clock)

beforeEach(() => {
  vi.clearAllMocks()
  clock = 1_000
})

describe('what Home may browse', () => {
  it('turns a fixed category into its Ravelry filter', async () => {
    expect(await browse().browse('sweaters', 2)).toEqual({
      ok: true,
      items: [ITEM],
      page: 2,
      lastPage: 3
    })
    expect(source.browse).toHaveBeenCalledWith('pullover', 2)
  })

  it('refuses anything that is not one of the fixed categories and a sensible page', async () => {
    const home = browse()
    for (const [category, page] of [
      ['pullover', 1],
      ['maturecontent', 1],
      ['hats&x=1', 1],
      [undefined, 1],
      ['hats', 0],
      ['hats', 201],
      ['hats', 1.5],
      ['hats', '1']
    ]) {
      expect(await home.browse(category, page)).toEqual({ ok: false })
    }
    expect(source.browse).not.toHaveBeenCalled()
  })

  it('never offers the mature content category', () => {
    expect(RAVELRY_CATEGORIES.map((item) => item.pc)).not.toContain('maturecontent')
  })

  it('keeps a page for 15 minutes, so going back and forth costs nothing', async () => {
    const home = browse()
    await home.browse('hats', 1)
    clock += 14 * 60_000
    await home.browse('hats', 1)
    expect(source.browse).toHaveBeenCalledTimes(1)
    clock += 2 * 60_000
    await home.browse('hats', 1)
    expect(source.browse).toHaveBeenCalledTimes(2)
  })

  it('does not remember a failure', async () => {
    const home = browse()
    source.browse.mockRejectedValueOnce(new Error('offline'))
    expect(await home.browse('hats', 1)).toEqual({ ok: false })
    expect((await home.browse('hats', 1)).ok).toBe(true)
  })
})

describe('categories', () => {
  it('gives every category a picture from its most popular pattern', async () => {
    const result = await browse().categories()
    if (!result.ok) throw new Error('expected categories')
    expect(result.categories).toHaveLength(RAVELRY_CATEGORIES.length)
    expect(result.categories[0]).toEqual({
      id: 'blankets',
      label: 'Blankets',
      thumbnailUrl: ITEM.thumbnailUrl
    })
  })

  it('still lists a category whose picture failed, unless everything failed', async () => {
    source.browse.mockRejectedValueOnce(new Error('offline'))
    const partial = await browse().categories()
    if (!partial.ok) throw new Error('expected categories')
    expect(partial.categories).toHaveLength(RAVELRY_CATEGORIES.length)
    expect(partial.categories.filter((item) => !item.thumbnailUrl)).toHaveLength(1)

    source.browse.mockRejectedValue(new Error('offline'))
    expect(await browse().categories()).toEqual({ ok: false })
    source.browse.mockResolvedValue({ items: [ITEM], lastPage: 3 })
  })
})

describe('looking a pattern over', () => {
  it('is refused until main has served that pattern', async () => {
    const home = browse()
    expect(await home.preview(7)).toEqual({ ok: false })
    expect(source.pattern).not.toHaveBeenCalled()
    expect(home.isServed(7)).toBe(false)
    await home.browse('hats', 1)
    expect(home.isServed(7)).toBe(true)
    expect(await home.preview(7)).toMatchObject({ ok: true, name: 'Hat', notes: 'Words' })
  })

  it('sends pictures as data, never as addresses', async () => {
    const home = browse()
    await home.browse('hats', 1)
    const preview = await home.preview(7)
    expect(JSON.stringify(preview)).not.toContain('images.example.com')
    expect(preview).toMatchObject({
      pictures: [expect.stringMatching(/^data:image\/jpeg/), expect.any(String)]
    })
  })

  it('keeps the words when a picture fails, and answers calmly when the pattern does', async () => {
    const home = browse()
    await home.browse('hats', 1)
    source.picture.mockRejectedValueOnce(new Error('https://images.example.com/a.jpg failed'))
    const preview = await home.preview(7)
    if (!preview.ok) throw new Error('expected a preview')
    expect(preview.pictures).toHaveLength(1)
    source.pattern.mockRejectedValueOnce(new Error('offline'))
    expect(await home.preview(7)).toEqual({ ok: false })
  })
})
