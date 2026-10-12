import { LIBRARY_EXTENSIONS } from '../media/mediaTypes'

export interface MusicTrack {
  id: string
  url: string
  title: string
  artist: string
  durationMs: number
  artUrl?: string
}

export interface MusicImportResult {
  imported: number
  failed: number
}
export interface MusicImportProgress extends MusicImportResult {
  completed: number
  total: number
}

export const MUSIC_EXTENSIONS = LIBRARY_EXTENSIONS.music
