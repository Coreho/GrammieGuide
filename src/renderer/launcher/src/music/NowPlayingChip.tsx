import type { MusicPlayerSnapshot } from './musicPlayer'

export function NowPlayingChip({
  state,
  onStop
}: {
  state: MusicPlayerSnapshot
  onStop: () => void
}) {
  if (!state.currentId || state.state === 'off') return null
  return (
    <div className="music-chip" aria-label="Music controls">
      {state.showChip && (
        <div title={state.title}>
          <span>
            {state.state === 'paused' || state.state === 'held' ? 'Music paused' : 'Music playing'}
          </span>
          <strong>{state.title || state.currentLabel}</strong>
        </div>
      )}
      <button onClick={onStop} aria-label="Stop music">
        ■ Stop
      </button>
    </div>
  )
}
