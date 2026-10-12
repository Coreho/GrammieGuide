import { extname } from 'node:path'
import type { PhotoCodec, PhotoImage } from './photoLibrary'

interface NativeImages {
  createFromPath(path: string): PhotoImage
  createThumbnailFromPath(
    path: string,
    size: { width: number; height: number }
  ): Promise<PhotoImage>
}

export function createNativePhotoCodec(
  images: NativeImages,
  platform: NodeJS.Platform = process.platform
): PhotoCodec {
  return {
    createFromPath: async (path) => {
      const image = images.createFromPath(path)
      const extension = extname(path).toLowerCase()
      if (!image.isEmpty() || platform !== 'win32' || !['.webp', '.heic'].includes(extension)) {
        return image
      }
      // Electron's direct decoder only handles PNG/JPEG. Its Windows thumbnail API
      // uses the installed Shell decoders instead, including HEIC where available.
      // Windows ignores height here; the service still bounds the returned longer edge.
      return images.createThumbnailFromPath(path, { width: 1600, height: 1600 })
    }
  }
}
