import { describe, expect, it } from 'vitest'
import {
  isMediaLibrary,
  isSafeMediaFileName,
  parseMediaUrl
} from '../../src/shared/media/mediaPath'

describe('media library and file names', () => {
  it.each(['music', 'photos'])('allows library %s', (library) => {
    expect(isMediaLibrary(library)).toBe(true)
  })

  it.each(['', 'news-cache', 'Music', 'constructor', '__proto__', '../photos'])(
    'rejects library %s',
    (library) => {
      expect(isMediaLibrary(library)).toBe(false)
    }
  )

  it.each([
    'a.png',
    'a-b_c.2.MP3',
    '123.wav',
    '.photo.jpg',
    'console.png',
    'com10.mp3',
    'a'.repeat(255)
  ])('allows filename %s', (name) => {
    expect(isSafeMediaFileName(name)).toBe(true)
  })

  it.each([
    '',
    '.',
    '..',
    '../a.png',
    'a..png',
    'a/b.png',
    'a\\b.png',
    '/a.png',
    'a b.png',
    'a.png ',
    'a.png.',
    'a.png\n',
    'a.png\r',
    'a\0.png',
    'a:stream.png',
    'a?.png',
    'a#.png',
    '%2e.png',
    'a+1.png',
    'é.png',
    'CON',
    'con.png',
    'Con.extra.png',
    'PRN.jpg',
    'AUX.wav',
    'NUL.mp3',
    'COM1.mp3',
    'com9.wav',
    'LPT1.png',
    'lpt9.jpg',
    'COM¹.mp3',
    'a'.repeat(256)
  ])('rejects filename %s', (name) => {
    expect(isSafeMediaFileName(name)).toBe(false)
  })
})

describe('parseMediaUrl', () => {
  it.each([
    ['grammie-media://photos/photo-1.png', { library: 'photos', fileName: 'photo-1.png' }],
    ['grammie-media://music/%61udio%2Emp3', { library: 'music', fileName: 'audio.mp3' }]
  ])('decodes a valid URL %s once', (url, expected) => {
    expect(parseMediaUrl(url as string)).toEqual(expected)
  })

  it.each([
    'https://photos/a.png',
    'grammie-media://news-cache/a.png',
    'grammie-media://photos',
    'grammie-media://photos/',
    'grammie-media://photos/a/b.png',
    'grammie-media://photos/../a.png',
    'grammie-media://photos/a/../b.png',
    'grammie-media://photos/%2e%2e/a.png',
    'grammie-media://photos/a%2Fb.png',
    'grammie-media://photos/a%5Cb.png',
    'grammie-media://photos/a%252Fb.png',
    'grammie-media://photos/a%00.png',
    'grammie-media://photos/a%20.png',
    'grammie-media://photos/a.png%20',
    'grammie-media://photos/a.png%2e',
    'grammie-media://photos/%43ON.png',
    'grammie-media://photos/a%2e%2epng',
    'grammie-media://photos/%FF.png',
    'grammie-media://photos/%.png',
    'grammie-media://photos/a.png?x=1',
    'grammie-media://photos/a.png#x',
    'grammie-media://photos:80/a.png',
    'grammie-media://user@photos/a.png',
    'grammie-media://%70hotos/a.png',
    'grammie-media://PHOTOS/a.png',
    'grammie-media://photos/a.png\n'
  ])('rejects URL %s', (url) => {
    expect(parseMediaUrl(url)).toBeNull()
  })
})
