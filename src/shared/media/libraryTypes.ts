import type { MediaLibrary } from './mediaPath'

/** Caregiver metadata only; source paths never become part of an entry. */
export type LibraryMetadata = Record<string, string | number | boolean | null>

export interface LibraryEntry {
  id: string
  fileName: string
  metadata: LibraryMetadata
}

export interface LibraryRequest {
  library: MediaLibrary
}
