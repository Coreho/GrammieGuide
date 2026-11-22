import { describe, expect, it } from 'vitest'
import {
  MAIN_ALBUM_LABEL,
  PHOTO_ALBUM_MAX,
  photoAlbums,
  sameAlbum,
  savedAlbumName,
  tidyAlbumName
} from '../../src/shared/media/photoAlbums'
import type { Photo } from '../../src/shared/media/photoTypes'

function photo(id: string, album: string, order = 0): Photo {
  return {
    id,
    url: `grammie-media://photos/${id}.jpg`,
    thumbnailUrl: `grammie-media://photos/${id}.thumb.jpg`,
    caption: '',
    date: '',
    showToHer: true,
    album,
    order,
    importIndex: order
  }
}

describe('photo album names', () => {
  it('tidies a pasted name to one line', () => {
    expect(tidyAlbumName('  New \n\t photos  ')).toBe('New photos')
    expect(tidyAlbumName('')).toBe('')
    expect(tidyAlbumName('   ')).toBe('')
  })

  it('refuses names that are not text, too long, or carry control characters', () => {
    expect(() => tidyAlbumName(42)).toThrow('Invalid album name')
    expect(() => tidyAlbumName(null)).toThrow('Invalid album name')
    expect(() => tidyAlbumName('x'.repeat(PHOTO_ALBUM_MAX + 1))).toThrow('Invalid album name')
    expect(tidyAlbumName('x'.repeat(PHOTO_ALBUM_MAX))).toHaveLength(PHOTO_ALBUM_MAX)
    expect(() => tidyAlbumName('New\u0000')).toThrow('Invalid album name')
    expect(() => tidyAlbumName('New\u007f')).toThrow('Invalid album name')
  })

  it('reads a saved name it no longer accepts as her main album instead of failing', () => {
    expect(savedAlbumName('New')).toBe('New')
    expect(savedAlbumName(undefined)).toBe('')
    expect(savedAlbumName(7)).toBe('')
    expect(savedAlbumName('x'.repeat(PHOTO_ALBUM_MAX + 5))).toBe('')
  })
})

describe('grouping photos into albums', () => {
  it('puts her main album first, then the others by name, keeping caregiver order inside each', () => {
    const albums = photoAlbums([
      photo('a', '', 0),
      photo('b', 'Wedding', 1),
      photo('c', 'New', 2),
      photo('d', '', 3),
      photo('e', 'new', 4)
    ])
    expect(albums.map((album) => [album.label, album.photos.map((entry) => entry.id)])).toEqual([
      [MAIN_ALBUM_LABEL, ['a', 'd']],
      ['New', ['c', 'e']],
      ['Wedding', ['b']]
    ])
  })

  it('has one album when every photo is in the same one, including only the new album', () => {
    expect(photoAlbums([photo('a', ''), photo('b', '')])).toHaveLength(1)
    const [only] = photoAlbums([photo('a', 'New')])
    expect(only).toMatchObject({ name: 'New', label: 'New' })
    expect(photoAlbums([])).toEqual([])
  })

  it('compares album names without case, like the grouping', () => {
    expect(sameAlbum('New', 'nEW')).toBe(true)
    expect(sameAlbum('', '')).toBe(true)
    expect(sameAlbum('New', '')).toBe(false)
  })
})
