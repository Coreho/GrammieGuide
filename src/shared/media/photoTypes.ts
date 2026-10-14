export interface Photo {
  id: string
  url: string
  thumbnailUrl: string
  caption: string
  showToHer: boolean
  order: number
  /** Stable tie-breaker assigned from the library's insertion order. */
  importIndex: number
  narration?: { url: string; autoPlay: boolean }
}

export type PhotoPatch = Partial<Pick<Photo, 'caption' | 'showToHer' | 'order'>>

export interface PhotoImportResult {
  imported: number
  failed: number
}

export interface PhotoImportProgress extends PhotoImportResult {
  completed: number
  total: number
}

// HEIC is an input only: decoding support is decided by nativeImage on this device.
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const
