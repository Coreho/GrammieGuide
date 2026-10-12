import type { MusicPlaylist } from '@shared/music/musicSchema'
import type { MusicTrack } from '@shared/music/musicTypes'

export function MusicPlaylistEditor({
  playlist,
  tracks,
  onChange,
  onRemove
}: {
  playlist: MusicPlaylist
  tracks: MusicTrack[]
  onChange: (list: MusicPlaylist) => void
  onRemove: () => void
}) {
  function toggle(id: string): void {
    onChange({
      ...playlist,
      trackIds: playlist.trackIds.includes(id)
        ? playlist.trackIds.filter((track) => track !== id)
        : [...playlist.trackIds, id]
    })
  }
  function move(index: number, direction: number): void {
    const ids = [...playlist.trackIds]
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    onChange({ ...playlist, trackIds: ids })
  }
  return (
    <section className="music-playlist" aria-label={`Playlist ${playlist.label || 'new'}`}>
      <label>
        Playlist name{' '}
        <input
          maxLength={40}
          value={playlist.label}
          onChange={(event) => onChange({ ...playlist, label: event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={playlist.shuffle}
          onChange={(event) => onChange({ ...playlist, shuffle: event.target.checked })}
        />{' '}
        Shuffle songs
      </label>
      <fieldset>
        <legend>Choose songs</legend>
        {tracks.length === 0 && <p>Import songs first.</p>}
        {tracks.map((track) => (
          <label key={track.id} className="music-song-choice">
            <input
              type="checkbox"
              checked={playlist.trackIds.includes(track.id)}
              onChange={() => toggle(track.id)}
            />
            {track.title}
            {track.artist ? ` — ${track.artist}` : ''}
          </label>
        ))}
      </fieldset>
      <ol aria-label="Song order">
        {playlist.trackIds.map((id, index) => {
          const title = tracks.find((track) => track.id === id)?.title ?? 'Song not set up yet'
          return (
            <li key={id}>
              <span>{title}</span>
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Move ${title} up`}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === playlist.trackIds.length - 1}
                aria-label={`Move ${title} down`}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove ${title} from playlist`}
                onClick={() => toggle(id)}
              >
                Remove
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" onClick={onRemove}>
        Remove playlist
      </button>
    </section>
  )
}
