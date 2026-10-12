import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { createTrackMetadataReader } from '../../src/main/services/music/readTrackMetadata'
import { MUSIC_EXTENSIONS } from '../../src/shared/music/musicTypes'

describe('real local audio metadata', () => {
  it.each(MUSIC_EXTENSIONS)(
    'reads a real %s file including duration and available tags',
    async (extension) => {
      const read = createTrackMetadataReader(() => ({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
        resize() {
          return this
        },
        toJPEG: () => Buffer.alloc(0)
      }))
      const track = await read(resolve(`tests/fixtures/music/tone.${extension}`))
      expect(track.title).toBe(extension === 'aac' ? 'tone' : 'Familiar test song')
      expect(track.artist).toBe(extension === 'aac' ? '' : 'Test artist')
      expect(track.durationMs).toBeGreaterThan(300)
      expect(track.durationMs).toBeLessThan(900)
    }
  )

  it('extracts embedded MP3 cover art and resizes its longer edge', async () => {
    const resize = vi.fn()
    const image = {
      isEmpty: () => false,
      getSize: () => ({ width: 1000, height: 600 }),
      resize,
      toJPEG: () => Buffer.from('jpeg')
    }
    resize.mockReturnValue(image)
    const decode = vi.fn(() => image)
    const result = await createTrackMetadataReader(decode)(resolve('tests/fixtures/music/tone.mp3'))
    expect(decode).toHaveBeenCalledOnce()
    expect(resize).toHaveBeenCalledWith({ width: 320 })
    expect(result.art).toEqual(Buffer.from('jpeg'))
  })

  it('keeps the song when cover decoding fails', async () => {
    const result = await createTrackMetadataReader(() => {
      throw new Error('unsupported cover')
    })(resolve('tests/fixtures/music/tone.mp3'))
    expect(result.title).toBe('Familiar test song')
    expect(result).not.toHaveProperty('art')
  })
})
