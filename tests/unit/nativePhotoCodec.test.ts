import { describe, expect, it, vi } from 'vitest'
import { createNativePhotoCodec } from '../../src/main/services/photos/nativePhotoCodec'
import type { PhotoImage } from '../../src/main/services/photos/photoLibrary'

describe('Windows native photo codec', () => {
  const empty = { isEmpty: () => true } as PhotoImage
  const decoded = { isEmpty: () => false } as PhotoImage

  it.each(['a.jpg', 'a.png', 'a.webp', 'a.heic'])(
    'keeps a successful direct decode of %s',
    async (path) => {
      const images = { createFromPath: vi.fn(() => decoded), createThumbnailFromPath: vi.fn() }
      expect(await createNativePhotoCodec(images, 'win32').createFromPath(path)).toBe(decoded)
      expect(images.createThumbnailFromPath).not.toHaveBeenCalled()
    }
  )

  it.each(['private/photo.WEBP', 'private/photo.HEIC'])(
    'uses Windows decoding for %s when the direct decoder is empty',
    async (path) => {
      const images = {
        createFromPath: vi.fn(() => empty),
        createThumbnailFromPath: vi.fn(async () => decoded)
      }
      expect(await createNativePhotoCodec(images, 'win32').createFromPath(path)).toBe(decoded)
      expect(images.createThumbnailFromPath).toHaveBeenCalledWith(path, {
        width: 1600,
        height: 1600
      })
    }
  )

  it.each(['linux', 'darwin'] as const)(
    'does not call Windows decoding on %s',
    async (platform) => {
      const images = { createFromPath: vi.fn(() => empty), createThumbnailFromPath: vi.fn() }
      expect(await createNativePhotoCodec(images, platform).createFromPath('a.heic')).toBe(empty)
      expect(images.createThumbnailFromPath).not.toHaveBeenCalled()
    }
  )

  it('leaves unsupported Windows HEIC as a rejected decode for the batch to count', async () => {
    const images = {
      createFromPath: vi.fn(() => empty),
      createThumbnailFromPath: vi.fn(async () => {
        throw new Error('no decoder')
      })
    }
    await expect(createNativePhotoCodec(images, 'win32').createFromPath('a.heic')).rejects.toThrow(
      'no decoder'
    )
  })

  it('does not try to rescue a failed JPEG through a cached Windows preview', async () => {
    const images = { createFromPath: vi.fn(() => empty), createThumbnailFromPath: vi.fn() }
    expect(await createNativePhotoCodec(images, 'win32').createFromPath('bad.jpg')).toBe(empty)
    expect(images.createThumbnailFromPath).not.toHaveBeenCalled()
  })
})
