import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Photo } from '@shared/media/photoTypes'
import { zLayers } from '@shared/zLayers'
import type { BuiltinViewProps } from './builtins'
import './PhotoViewer.css'

/** Still photos by default: she has time to enjoy one without having to keep up. */
export function PhotoViewer({ tile, config, onClose, musicStop }: BuiltinViewProps) {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const home = useRef<HTMLButtonElement>(null)
  const surface = useRef<HTMLElement>(null)
  const photo = photos?.[index]
  const count = photos?.length ?? 0
  const imageReady = Boolean(photo && loadedId === photo.id && failedId !== photo.id)
  const playing = config.photos.slideshowEnabled && !paused

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    home.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    let live = true
    window.launcher
      .openPhotos()
      .then((result) => {
        if (live) setPhotos(result)
      })
      .catch(() => {
        if (live) setUnavailable(true)
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!playing || !imageReady || count < 2) return
    // Wait from the displayed photo, not from when loading began. Manual paging,
    // pause, a failed image, or leaving the viewer cancels this pending advance.
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), 30_000)
    return () => window.clearTimeout(timer)
  }, [playing, imageReady, count, index])

  function move(direction: number): void {
    if (count < 2) {
      onClose()
      return
    }
    setFailedId(null)
    setLoadedId(null)
    setIndex((current) => (current + direction + count) % count)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
    }
    if (event.key === 'ArrowRight' && count > 1) {
      event.preventDefault()
      move(1)
    }
    if (event.key !== 'Tab') return
    const controls = surface.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]')
    const first = controls?.[0]
    const last = controls?.[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="photo-viewer" style={{ zIndex: zLayers.photoViewer }}>
      <section
        ref={surface}
        className="photo-viewer-surface"
        role="dialog"
        aria-modal="true"
        aria-label={tile.label}
        onKeyDown={onKeyDown}
      >
        <header className="photo-viewer-header">
          <button ref={home} onClick={onClose}>
            🏠 Home
          </button>
          <h1>{tile.label}</h1>
          {musicStop}
        </header>
        <div className="photo-viewer-picture" aria-busy={!photos && !unavailable}>
          {unavailable && <p role="status">The photos aren&apos;t ready right now.</p>}
          {!photos && !unavailable && <p role="status">Getting your photos ready…</p>}
          {photos && count === 0 && (
            <p role="status">Your photos will be here when your family adds them.</p>
          )}
          {photo && failedId === photo.id && (
            <p role="status">This photo isn&apos;t ready right now.</p>
          )}
          {photo && failedId !== photo.id && (
            <img
              key={photo.id}
              src={photo.url}
              alt="Family photo"
              draggable={false}
              onLoad={() => setLoadedId(photo.id)}
              onError={() => setFailedId(photo.id)}
            />
          )}
        </div>
        {photo?.caption && failedId !== photo.id && (
          <p className="photo-viewer-caption" tabIndex={0}>
            {photo.caption}
          </p>
        )}
        <footer className="photo-viewer-controls">
          <button
            aria-label={count > 1 ? 'Previous photo' : 'Back to Home'}
            onClick={() => move(-1)}
          >
            ← Back
          </button>
          {config.photos.slideshowEnabled && count > 1 && (
            <button onClick={() => setPaused((current) => !current)}>
              {paused ? 'Play photos' : 'Pause photos'}
            </button>
          )}
          {count > 1 && (
            <button aria-label="Next photo" onClick={() => move(1)}>
              Next →
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
