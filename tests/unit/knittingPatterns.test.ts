import { describe, expect, it, vi } from 'vitest'
import {
  importPatternPages,
  removePatternPages,
  type PatternLibrary
} from '../../src/main/services/knitting/knittingPatterns'
import type { PhotoCodec, PhotoImage } from '../../src/main/services/photos/photoLibrary'
import {
  MAX_PATTERN_PAGES,
  PATTERN_PAGE_EDGE,
  knittingFileSchema,
  orderPagePaths,
  pageToOpen
} from '../../src/shared/knitting/knitting'

function image(width: number, height: number, resized: unknown[]): PhotoImage {
  return {
    isEmpty: () => width === 0,
    getSize: () => ({ width, height }),
    resize: (size) => {
      resized.push(size)
      const scale = (size.width ?? (size.height! * width) / height) / width
      return image(Math.round(width * scale), Math.round(height * scale), resized)
    },
    toJPEG: () => Buffer.from(`jpeg ${width}x${height}`)
  }
}

function fakeLibrary(): PatternLibrary & { added: Buffer[] } {
  let next = 0
  const added: Buffer[] = []
  return {
    added,
    addImage: vi.fn(async (jpeg: Buffer, _thumb: Buffer, metadata) => {
      added.push(jpeg)
      next += 1
      return { id: `page-${next}`, fileName: `page-${next}.jpg`, metadata }
    }),
    remove: vi.fn(async () => true),
    list: vi.fn(async () => [])
  }
}

describe('pattern page import', () => {
  it('keeps pages in file-name order, so page2 comes before page10', () => {
    expect(orderPagePaths(['C:\\p\\Page10.jpg', 'C:\\p\\page2.jpg', 'D:/scans/page1.png'])).toEqual(
      ['D:/scans/page1.png', 'C:\\p\\page2.jpg', 'C:\\p\\Page10.jpg']
    )
  })

  it('re-encodes each page with more detail than a photo, and tags it with its pattern', async () => {
    const resized: unknown[] = []
    const codec: PhotoCodec = { createFromPath: () => image(3000, 4200, resized) }
    const library = fakeLibrary()
    const result = await importPatternPages(['b.png', 'a.jpg'], library, codec, 'pattern-1')
    expect(result).toEqual({ pages: ['page-1', 'page-2'], failed: 0 })
    // Portrait page: the longer edge (height) is bounded at the page limit, then the thumbnail.
    expect(resized).toContainEqual({ height: PATTERN_PAGE_EDGE })
    expect(resized).toContainEqual({ height: 320 })
    expect(library.added[0]!.toString()).toBe('jpeg 1714x2400')
    expect(library.addImage).toHaveBeenCalledWith(expect.any(Buffer), expect.any(Buffer), {
      patternId: 'pattern-1'
    })
  })

  it('counts unreadable pages without stopping the rest', async () => {
    const codec: PhotoCodec = {
      createFromPath: (path) => image(path.includes('blank') ? 0 : 800, 1000, [])
    }
    const library = fakeLibrary()
    const result = await importPatternPages(
      ['1.png', 'notes.txt', '2-blank.png', '3.heic'],
      library,
      codec,
      'pattern-1'
    )
    expect(result).toEqual({ pages: ['page-1', 'page-2'], failed: 2 })
  })

  it('refuses more pages than one pattern holds before decoding any', async () => {
    const codec = { createFromPath: vi.fn() }
    const paths = Array.from({ length: MAX_PATTERN_PAGES + 1 }, (_, i) => `${i}.png`)
    await expect(importPatternPages(paths, fakeLibrary(), codec, 'p')).rejects.toThrow(
      `Choose up to ${MAX_PATTERN_PAGES} pages`
    )
    expect(codec.createFromPath).not.toHaveBeenCalled()
  })

  it('removes pages best effort, carrying on past one that fails', async () => {
    const library = fakeLibrary()
    vi.mocked(library.remove).mockRejectedValueOnce(new Error('EBUSY'))
    await removePatternPages(library, ['a', 'b'])
    expect(library.remove).toHaveBeenCalledTimes(2)
  })
})

describe('pattern memory', () => {
  it('reopens on her page, kept inside the pattern as it is now', () => {
    const pages = [{}, {}, {}]
    expect(pageToOpen({ lastPage: 1, pages })).toBe(1)
    expect(pageToOpen({ lastPage: 7, pages })).toBe(2)
    expect(pageToOpen({ lastPage: -3, pages })).toBe(0)
  })

  it('reads a knitting file saved before patterns existed', () => {
    expect(knittingFileSchema.parse({ version: 1, project: null })).toEqual({
      version: 1,
      project: null,
      patterns: []
    })
  })
})
