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

export const MUSIC_EXTENSIONS = ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'wav'] as const
