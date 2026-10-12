import { describe, expect, it } from 'vitest'
import {
  LIBRARY_CONTENT_TYPES,
  LIBRARY_EXTENSIONS,
  MEDIA_CONTENT_TYPES,
  isLibraryMediaExtension
} from '../../src/shared/media/mediaTypes'

const photos = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}
const music = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm'
}

describe('supported media types', () => {
  it('keeps the protocol types and per-library picker extensions in sync', () => {
    expect(LIBRARY_CONTENT_TYPES).toEqual({ photos, music })
    expect(MEDIA_CONTENT_TYPES).toEqual({ ...photos, ...music })
    expect(LIBRARY_EXTENSIONS).toEqual({
      photos: Object.keys(photos).map((ext) => ext.slice(1)),
      music: Object.keys(music).map((ext) => ext.slice(1))
    })
  })

  for (const [library, supported, other] of [
    ['photos', photos, music],
    ['music', music, photos]
  ] as const) {
    it.each(Object.keys(supported))(`accepts %s only in ${library}, regardless of case`, (ext) => {
      expect(isLibraryMediaExtension(library, ext)).toBe(true)
      expect(isLibraryMediaExtension(library, ext.toUpperCase())).toBe(true)
    })

    it.each([
      ...Object.keys(other),
      '.exe',
      '.svg',
      '.heic',
      '.tiff',
      '.mp4',
      '',
      '.',
      '.jpg.exe',
      '.png ',
      '.toString',
      'constructor',
      '__proto__'
    ])(`rejects %s in ${library}`, (ext) => {
      expect(isLibraryMediaExtension(library, ext)).toBe(false)
    })
  }
})
