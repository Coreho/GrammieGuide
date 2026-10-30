import { useEffect, useRef, useState } from 'react'
import { zLayers } from '@shared/zLayers'
import type { NewsPreview, NewsSource } from '@shared/news/sources'
import { NewspaperIcon } from '../icons'
import type { BuiltinViewProps } from './builtins'
import './NewsShelf.css'

export function NewsShelf({ tile, onClose, onBrowsing, musicStop }: BuiltinViewProps) {
  const surface = useRef<HTMLElement>(null)
  const home = useRef<HTMLButtonElement>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    home.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  async function open(source: NewsSource): Promise<void> {
    if (opening) return
    setOpening(source.id)
    setStatus(`Opening ${source.label}…`)
    try {
      const result = await window.launcher.openNewsSource(tile.id, source.id)
      if (result.ok) onBrowsing()
      else setStatus('Choose another news site, or go back to Home.')
    } catch {
      setStatus('Choose another news site, or go back to Home.')
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="news-shelf" style={{ zIndex: zLayers.newsOverlay }}>
      <section
        ref={surface}
        className="news-shelf-surface"
        role="dialog"
        aria-modal="true"
        aria-label={tile.label}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
            return
          }
          const controls = Array.from(
            surface.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
          )
          const index = controls.indexOf(document.activeElement as HTMLButtonElement)
          if (event.key === 'Tab') {
            if (event.shiftKey && index <= 0) {
              event.preventDefault()
              controls.at(-1)?.focus()
            } else if (!event.shiftKey && index === controls.length - 1) {
              event.preventDefault()
              controls[0]?.focus()
            }
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            controls[
              (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length
            ]?.focus()
          }
        }}
      >
        <header className="news-shelf-header">
          <button ref={home} className="news-shelf-home" onClick={onClose}>
            Back to Home
          </button>
          <h1>{tile.label}</h1>
          {musicStop}
        </header>
        <div className="news-shelf-grid">
          {tile.newsSources?.map((source) => (
            <SourceCard
              key={`${source.id}:${source.url}`}
              tileId={tile.id}
              source={source}
              disabled={opening !== null}
              onOpen={() => void open(source)}
            />
          ))}
        </div>
        <p className="news-shelf-status" role="status">
          {status}
        </p>
      </section>
    </div>
  )
}

function SourceCard({
  tileId,
  source,
  disabled,
  onOpen
}: {
  tileId: string
  source: NewsSource
  disabled: boolean
  onOpen: () => void
}) {
  const [preview, setPreview] = useState<NewsPreview>({})
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    let live = true
    window.launcher.getNewsPreview(tileId, source.id).then(
      (result) => {
        if (live) setPreview(result)
      },
      () => {} // The named choice remains usable offline and while previews load.
    )
    return () => {
      live = false
    }
  }, [tileId, source.id, source.url])

  return (
    <button
      className="news-source-card"
      data-news-source={source.id}
      aria-label={source.label}
      disabled={disabled}
      onClick={onOpen}
    >
      <span className="news-source-preview" aria-hidden="true">
        {preview.image && !imageFailed ? (
          <img src={preview.image} alt="" draggable={false} onError={() => setImageFailed(true)} />
        ) : (
          <span className="news-source-fallback">
            <NewspaperIcon />
          </span>
        )}
      </span>
      <span className="news-source-label">
        <span>{source.label}</span>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M6 16h19m-8-8 8 8-8 8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}
