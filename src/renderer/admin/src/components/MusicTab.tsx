import { useEffect, useState } from 'react'
import type { MusicImportProgress, MusicTrack } from '@shared/music/musicTypes'
import type { MusicSettings } from '@shared/music/musicSchema'
import { MusicPlaylistEditor } from './MusicPlaylistEditor'
import './MusicTab.css'

function lengthLabel(ms: number): string {
  if (!ms) return 'Length unavailable'
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function MusicTab() {
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [settings, setSettings] = useState<MusicSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<MusicImportProgress | null>(null)

  useEffect(() => {
    let live = true
    window.admin.getMusicLibrary().then(
      (result) => {
        if (live) {
          setTracks(result.tracks)
          setSettings(result.settings)
        }
      },
      () => {
        if (live) setError('Could not load music. Try opening this tab again.')
      }
    )
    const off = window.admin.onMusicImportProgress((count) => {
      if (live) setProgress(count)
    })
    return () => {
      live = false
      off()
    }
  }, [])

  async function run(work: () => Promise<string>): Promise<void> {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      setMessage(await work())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save music. Please try again.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function importSongs(): Promise<string> {
    const count = await window.admin.importMusic()
    const result = await window.admin.getMusicLibrary()
    setTracks(result.tracks)
    return `${count.imported} imported, ${count.failed} failed. Original files are unchanged.`
  }

  async function removeSong(track: MusicTrack): Promise<string> {
    if (
      !window.confirm(
        `Remove “${track.title}” from the library and every playlist? The original file stays where it was.`
      )
    )
      return 'Nothing removed.'
    await window.admin.removeMusicTrack(track.id)
    const result = await window.admin.getMusicLibrary()
    setTracks(result.tracks)
    // Retain any unsaved caregiver edits while removing references to the deleted song.
    setSettings((current) =>
      current
        ? {
            ...current,
            playlists: current.playlists.map((list) => ({
              ...list,
              trackIds: list.trackIds.filter((id) => id !== track.id)
            }))
          }
        : result.settings
    )
    return 'Song removed from the library and every playlist.'
  }

  return (
    <div className="music-tab">
      <h2>Music library and playlists</h2>
      <p>Import familiar songs for offline listening. Original files stay where they are.</p>
      <p role="status" aria-live="polite">
        {busy && progress
          ? `Processed ${progress.completed} of ${progress.total}: ${progress.imported} imported, ${progress.failed} failed.`
          : message}
      </p>
      {error && <p role="alert">{error}</p>}
      {!settings && !error && <p>Loading music…</p>}
      <fieldset disabled={busy || !settings} className="music-controls">
        <legend>Song library</legend>
        <button type="button" onClick={() => void run(importSongs)}>
          Add music files…
        </button>
        {tracks.length === 0 && <p>No songs yet. Add MP3, M4A, AAC, FLAC, OGG or WAV files.</p>}
        <ul className="music-tracks" aria-label="Imported songs">
          {tracks.map((track) => (
            <li key={track.id}>
              {track.artUrl && <Cover url={track.artUrl} />}
              <div>
                <strong>{track.title}</strong>
                <p>
                  {track.artist || 'Artist not listed'} · {lengthLabel(track.durationMs)}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove song: ${track.title}`}
                onClick={() => void run(() => removeSong(track))}
              >
                Remove song
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
      {settings && (
        <fieldset disabled={busy} className="music-controls">
          <legend>Playlists and listening settings</legend>
          <p>Up to six playlists. Changes take effect when you save.</p>
          {settings.playlists.map((playlist) => (
            <MusicPlaylistEditor
              key={playlist.id}
              playlist={playlist}
              tracks={tracks}
              onChange={(updated) =>
                setSettings({
                  ...settings,
                  playlists: settings.playlists.map((list) =>
                    list.id === updated.id ? updated : list
                  )
                })
              }
              onRemove={() =>
                setSettings({
                  ...settings,
                  playlists: settings.playlists.filter((list) => list.id !== playlist.id)
                })
              }
            />
          ))}
          <button
            type="button"
            disabled={settings.playlists.length >= 6}
            onClick={() =>
              setSettings({
                ...settings,
                playlists: [
                  ...settings.playlists,
                  { id: crypto.randomUUID(), label: '', shuffle: false, trackIds: [] }
                ]
              })
            }
          >
            Add playlist
          </button>
          <label>
            Auto-stop after (minutes){' '}
            <input
              type="number"
              min={10}
              max={480}
              step={1}
              value={settings.autoStopMinutes}
              onChange={(event) =>
                setSettings({ ...settings, autoStopMinutes: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showNowPlayingChip}
              onChange={(event) =>
                setSettings({ ...settings, showNowPlayingChip: event.target.checked })
              }
            />{' '}
            Show now-playing chip on Home
          </label>
          <button
            type="button"
            onClick={() =>
              void run(async () => {
                const saved = await window.admin.saveMusicSettings(settings)
                setSettings(saved)
                return 'Playlists and music settings saved.'
              })
            }
          >
            Save playlists and settings
          </button>
        </fieldset>
      )}
    </div>
  )
}

function Cover({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? null : <img src={url} alt="" onError={() => setFailed(true)} />
}
