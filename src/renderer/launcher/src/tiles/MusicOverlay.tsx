import { useEffect, useRef, type KeyboardEvent, type ButtonHTMLAttributes } from 'react'
import { zLayers } from '@shared/zLayers'
import { tileBackground, tileInk } from '../clay'
import { useMusicPlayer } from '../music/useMusicPlayer'
import type { BuiltinViewProps } from './builtins'
import './MusicOverlay.css'
import { useLabelFit } from '../components/useLabelFit'

export function MusicOverlay({ tile, onClose }: BuiltinViewProps) {
  const { player, state } = useMusicPlayer()
  const home = useRef<HTMLButtonElement>(null)
  const surface = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    home.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  function keys(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const controls = surface.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const first = controls?.[0],
      last = controls?.[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  return (
    <div className="music-overlay" style={{ zIndex: zLayers.musicOverlay }}>
      <section
        ref={surface}
        className="music-surface"
        role="dialog"
        aria-modal="true"
        aria-label={tile.label}
        onKeyDown={keys}
      >
        <header className="music-header">
          <button ref={home} onClick={onClose}>
            🏠 Home
          </button>
          <h1>{tile.label}</h1>
        </header>
        {state.loading ? (
          <p className="music-empty" role="status">
            Getting your music ready…
          </p>
        ) : state.playlists.length === 0 ? (
          <p className="music-empty" role="status">
            {tile.label} is not set up yet.
          </p>
        ) : (
          <div className="music-playlists">
            {state.playlists.map((list, index) => {
              const unavailable = state.unavailable.has(list.id)
              return (
                <MusicCard
                  key={list.id}
                  className="music-card"
                  aria-pressed={state.currentId === list.id}
                  disabled={unavailable}
                  onClick={() => void player.play(list.id)}
                  style={{ background: tileBackground(index % 4), color: tileInk(index % 4) }}
                  label={list.label}
                >
                  <span>
                    {unavailable
                      ? 'Not available right now'
                      : state.currentId === list.id
                        ? 'Selected'
                        : '▶ Play'}
                  </span>
                </MusicCard>
              )
            })}
          </div>
        )}
        <p className="music-current" aria-live="polite">
          {state.currentId
            ? `${state.state === 'paused' || state.state === 'held' ? 'Paused: ' : ''}${state.title || state.currentLabel}`
            : ''}
        </p>
        <footer className="music-actions">
          <button disabled={!state.currentId} onClick={() => void player.togglePause()}>
            {state.state === 'paused' ? '▶ Play music' : 'Ⅱ Pause music'}
          </button>
          <button className="music-stop" disabled={!state.currentId} onClick={() => player.stop()}>
            ■ Stop music
          </button>
          <button className="music-next" disabled={!state.currentId} onClick={() => player.next()}>
            Next song →
          </button>
        </footer>
      </section>
    </div>
  )
}

function MusicCard({
  label,
  children,
  ...props
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useLabelFit<HTMLElement>(label, `${props.disabled}-${props['aria-pressed']}`)
  return (
    <button {...props}>
      <strong ref={ref}>{label}</strong>
      {children}
    </button>
  )
}
