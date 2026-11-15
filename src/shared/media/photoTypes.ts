export interface Photo {
  id: string
  url: string
  thumbnailUrl: string
  caption: string
  /**
   * When it was taken, in the caregiver's own words ("Summer 1962"). Free text on
   * purpose: for most old family photos nobody knows the day, and a made-up exact
   * date would be a small lie on her screen.
   */
  date: string
  showToHer: boolean
  order: number
  /** Stable tie-breaker assigned from the library's insertion order. */
  importIndex: number
  narration?: { url: string; autoPlay: boolean }
}

export type PhotoPatch = Partial<Pick<Photo, 'caption' | 'date' | 'showToHer' | 'order'>>

export const PHOTO_DATE_MAX = 60

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
