import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { pageToOpen, type HomePattern } from '@shared/knitting/knitting'
import { KnittingPicture } from './KnittingProject'

export function PatternsCard({
  patterns,
  onOpen
}: {
  patterns: HomePattern[]
  onOpen: () => void
}) {
  const detail = patterns.length === 1 ? patterns[0]!.name : `${patterns.length} patterns`
  return (
    <button
      className="knitting-card"
      data-knitting-card="patterns"
      aria-label={`Patterns: ${detail}`}
      onClick={onOpen}
    >
      <span className="knitting-card-picture knitting-card-page" aria-hidden="true">
        <KnittingPicture source={patterns[0]?.thumbnailUrl} />
      </span>
      <span className="knitting-card-label">
        <span className="knitting-card-title">Patterns</span>
        <span className="knitting-card-detail">{detail}</span>
      </span>
    </button>
  )
}

export function PatternList({
  patterns,
  onOpen,
  onBack,
  onHome,
  musicStop
}: {
  patterns: HomePattern[]
  onOpen: (id: string) => void
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  return (
    <>
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          Back to Knitting
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1>Patterns</h1>
        {musicStop}
      </header>
      <div className="knitting-pattern-grid">
        {patterns.map((pattern) => (
          <button
            key={pattern.id}
            className="knitting-card"
            data-pattern-card={pattern.id}
            aria-label={`${pattern.name}, ${pattern.pages.length} ${pattern.pages.length === 1 ? 'page' : 'pages'}`}
            onClick={() => onOpen(pattern.id)}
          >
            <span className="knitting-card-picture knitting-card-page" aria-hidden="true">
              <KnittingPicture source={pattern.thumbnailUrl} />
            </span>
            <span className="knitting-card-label">
              <span className="knitting-card-title">{pattern.name}</span>
              <span className="knitting-card-detail">
                {pattern.pages.length} {pattern.pages.length === 1 ? 'page' : 'pages'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * One page at a time, as large as the screen allows, reopening where she left off.
 * Main remembers the page; a page whose picture is gone gets a calm line and the
 * buttons keep working around it.
 */
export function PatternViewer({
  pattern,
  backLabel,
  onBack,
  onHome,
  onPage,
  musicStop
}: {
  pattern: HomePattern
  backLabel: string
  onBack: () => void
  onHome: () => void
  /** Remembers the page she turned to, so the pattern reopens there. */
  onPage: (page: number) => void
  musicStop?: ReactNode
}) {
  const [page, setPage] = useState(() => pageToOpen(pattern))
  const [failed, setFailed] = useState<string | null>(null)
  const count = pattern.pages.length
  const shown = Math.min(page, count - 1)
  const url = pattern.pages[shown]?.url

  function go(next: number): void {
    if (next < 0 || next >= count || next === shown) return
    setPage(next)
    onPage(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(shown + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(shown - 1)
    }
  }

  return (
    <div className="knitting-view" onKeyDown={onKeyDown}>
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          {backLabel}
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1 className="knitting-pattern-title">{pattern.name}</h1>
        {musicStop}
      </header>
      <div className="knitting-pattern-page">
        {url && failed !== url ? (
          <img
            key={url}
            src={url}
            alt={`${pattern.name}, page ${shown + 1} of ${count}`}
            draggable={false}
            onError={() => setFailed(url)}
          />
        ) : (
          <p className="knitting-shelf-calm" role="status">
            This page isn&apos;t ready right now.
          </p>
        )}
      </div>
      <TurnControls
        noun="page"
        position={`Page ${shown + 1} of ${count}`}
        atStart={shown === 0}
        atEnd={shown === count - 1}
        onTurn={(step) => go(shown + step)}
      />
    </div>
  )
}

/** Large Back and Next with where she is between them; patterns and her gallery share it. */
export function TurnControls({
  noun,
  position,
  atStart,
  atEnd,
  onTurn
}: {
  noun: 'page' | 'piece'
  position: string
  atStart: boolean
  atEnd: boolean
  onTurn: (step: -1 | 1) => void
}) {
  return (
    <footer className="knitting-pattern-controls">
      <button
        className="knitting-pattern-turn"
        aria-label={`Previous ${noun}`}
        disabled={atStart}
        onClick={() => onTurn(-1)}
      >
        ← Back
      </button>
      <p className="knitting-pattern-position" aria-live="polite">
        {position}
      </p>
      <button
        className="knitting-pattern-turn"
        aria-label={`Next ${noun}`}
        disabled={atEnd}
        onClick={() => onTurn(1)}
      >
        Next →
      </button>
    </footer>
  )
}
