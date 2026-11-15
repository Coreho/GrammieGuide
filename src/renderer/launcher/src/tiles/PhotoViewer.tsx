import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Photo } from '@shared/media/photoTypes'
import { zLayers } from '@shared/zLayers'
import type { BuiltinViewProps } from './builtins'
import './PhotoViewer.css'
import { useNarration } from '../../../audio/useNarration'

/** Still photos by default: she has time to enjoy one without having to keep up. */
export function PhotoViewer({ tile, config, onClose, musicStop }: BuiltinViewProps) {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  // Which photo's card is open. Keyed by photo, so every new photo starts plain
  // and a photo the caregiver swaps in mid-view can't inherit an open card.
  const [aboutId, setAboutId] = useState<string | null>(null)
  const home = useRef<HTMLButtonElement>(null)
  const surface = useRef<HTMLElement>(null)
  const photo = photos?.[index]
  const count = photos?.length ?? 0
  const imageReady = Boolean(photo && loadedId === photo.id && failedId !== photo.id)
  const playing = config.photos.slideshowEnabled && !paused
  const hasAbout = Boolean(photo && (photo.caption || photo.date))
  const aboutOpen = Boolean(photo && hasAbout && imageReady && aboutId === photo.id)
  const narration = useNarration(imageReady ? photo?.narration?.url : undefined)
  const autoPlayed = useRef<string | null>(null)

  useEffect(() => {
    if (!photo || !imageReady || !photo.narration?.autoPlay) return
    const key = `${photo.id}:${photo.narration.url}`
    if (autoPlayed.current === key) return
    autoPlayed.current = key
    void narration.play()
  }, [photo, imageReady, narration.play])

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
    const unsubscribe = window.launcher.onPhotosChanged(() => {
      void window.launcher.listPhotos().then(
        (result) => {
          if (live) {
            setPhotos(result)
            setIndex((current) => Math.min(current, Math.max(0, result.length - 1)))
          }
        },
        () => {}
      )
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    // An open card means she is reading: the photo stays until she closes it.
    if (!playing || !imageReady || count < 2 || narration.playing || aboutOpen) return
    // Wait from the displayed photo, not from when loading began. Manual paging,
    // pause, a failed image, or leaving the viewer cancels this pending advance.
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), 30_000)
    return () => window.clearTimeout(timer)
  }, [playing, imageReady, count, index, narration.playing, aboutOpen])

  function move(direction: number): void {
    narration.stop()
    autoPlayed.current = null
    if (count < 2) {
      onClose()
      return
    }
    setFailedId(null)
    setLoadedId(null)
    setAboutId(null)
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
          {photo && failedId !== photo.id && !hasAbout && (
            <img
              key={photo.id}
              src={photo.url}
              alt="Family photo"
              draggable={false}
              onLoad={() => setLoadedId(photo.id)}
              onError={() => setFailedId(photo.id)}
            />
          )}
          {photo && failedId !== photo.id && hasAbout && (
            // The whole picture is the target: no small control to find or aim at.
            <button
              key={photo.id}
              className="photo-viewer-photo"
              aria-expanded={aboutOpen}
              aria-controls="photo-viewer-about"
              aria-label={
                aboutOpen ? 'Family photo. Hide the words' : 'Family photo. Read about it'
              }
              onClick={() => setAboutId(aboutOpen ? null : photo.id)}
            >
              <img
                src={photo.url}
                alt=""
                draggable={false}
                onLoad={() => setLoadedId(photo.id)}
                onError={() => setFailedId(photo.id)}
              />
            </button>
          )}
          {photo && aboutOpen && (
            <div id="photo-viewer-about" className="photo-viewer-about" tabIndex={0}>
              {photo.caption && <p className="photo-viewer-caption">{photo.caption}</p>}
              {photo.date && <p className="photo-viewer-date">{photo.date}</p>}
            </div>
          )}
        </div>
        {imageReady && hasAbout && !aboutOpen && (
          <p className="photo-viewer-hint">Tap the photo to read about it</p>
        )}
        {imageReady && photo?.narration && (
          <div className="photo-viewer-story">
            <button onClick={() => (narration.playing ? narration.stop() : void narration.play())}>
              {narration.playing ? 'Stop story' : 'Listen to the story'}
            </button>
            {narration.error && <p role="status">The story isn&apos;t ready right now.</p>}
          </div>
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
