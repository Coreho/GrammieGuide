import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { HomeRavelryPattern } from '@shared/knitting/knitting'
import { KnittingPicture } from './KnittingProject'
import { TurnControls } from './KnittingPatterns'

const WEBSITE_DETAIL = 'Patterns and ideas online'

export function RavelryCard({
  patterns,
  disabled,
  onOpen
}: {
  patterns: HomeRavelryPattern[]
  disabled: boolean
  onOpen: () => void
}) {
  const detail =
    patterns.length === 0
      ? WEBSITE_DETAIL
      : patterns.length === 1
        ? patterns[0]!.name
        : `${patterns.length} patterns`
  return (
    <button
      className="knitting-card"
      data-knitting-card="ravelry"
      aria-label={`Ravelry: ${patterns.length === 0 ? WEBSITE_DETAIL.toLowerCase() : detail}`}
      disabled={disabled}
      onClick={onOpen}
    >
      <span className="knitting-card-picture" aria-hidden="true">
        <KnittingPicture source={patterns[0]?.thumbnailUrl} />
      </span>
      <span className="knitting-card-label">
        <span className="knitting-card-title">Ravelry</span>
        <span className="knitting-card-detail">{detail}</span>
      </span>
    </button>
  )
}

/** The patterns picked for her, and the website last when the caregiver has switched it on. */
export function RavelryList({
  patterns,
  showWebsite,
  openingWebsite,
  websiteFailed,
  onOpen,
  onOpenWebsite,
  onBack,
  onHome,
  musicStop
}: {
  patterns: HomeRavelryPattern[]
  showWebsite: boolean
  openingWebsite: boolean
  websiteFailed: boolean
  onOpen: (id: string) => void
  onOpenWebsite: () => void
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
        <h1>Ravelry</h1>
        {musicStop}
      </header>
      <div className="knitting-pattern-grid">
        {patterns.map((pattern) => (
          <button
            key={pattern.id}
            className="knitting-card"
            data-ravelry-card={pattern.id}
            aria-label={pattern.designer ? `${pattern.name}, by ${pattern.designer}` : pattern.name}
            onClick={() => onOpen(pattern.id)}
          >
            <span className="knitting-card-picture" aria-hidden="true">
              <KnittingPicture source={pattern.thumbnailUrl} />
            </span>
            <span className="knitting-card-label">
              <span className="knitting-card-title knitting-ravelry-card-title">
                {pattern.name}
              </span>
              {pattern.designer && <span className="knitting-card-detail">{pattern.designer}</span>}
            </span>
          </button>
        ))}
        {showWebsite && (
          <button
            className="knitting-card"
            data-ravelry-card="website"
            aria-label={`Ravelry website: ${WEBSITE_DETAIL.toLowerCase()}`}
            disabled={openingWebsite}
            onClick={onOpenWebsite}
          >
            <span className="knitting-card-picture" aria-hidden="true">
              <KnittingPicture />
            </span>
            <span className="knitting-card-label">
              <span className="knitting-card-title">Ravelry website</span>
              <span className="knitting-card-detail">{WEBSITE_DETAIL}</span>
            </span>
          </button>
        )}
      </div>
      {websiteFailed && showWebsite && (
        <p className="knitting-shelf-status" role="status">
          Ravelry can&apos;t open right now.
        </p>
      )}
    </>
  )
}

/**
 * One pattern: its pictures beside what Ravelry says about it, as plain words saved when
 * the caregiver picked it, so nothing here needs the internet or Ravelry's website.
 */
export function RavelryViewer({
  pattern,
  onBack,
  onHome,
  musicStop
}: {
  pattern: HomeRavelryPattern
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const words = useRef<HTMLDivElement>(null)
  const count = pattern.pictures.length
  // The caregiver can't shrink a saved pattern, but a reload can leave it with fewer pictures.
  const shown = Math.min(index, Math.max(0, count - 1))
  const url = pattern.pictures[shown]?.url

  function go(next: number): void {
    if (next >= 0 && next < count) setIndex(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(shown + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(shown - 1)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // The words scroll separately from the buttons, so the keys have to reach them too.
      event.preventDefault()
      words.current?.scrollBy({ top: event.key === 'ArrowDown' ? 160 : -160 })
    }
  }

  return (
    <div className="knitting-view" onKeyDown={onKeyDown}>
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          Back to Ravelry
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1 className="knitting-pattern-title">{pattern.name}</h1>
        {musicStop}
      </header>
      <div className="knitting-ravelry-pattern">
        <div className="knitting-ravelry-pictures">
          <div className="knitting-piece-picture">
            {url && failed !== url ? (
              <img
                key={url}
                src={url}
                alt={pattern.name}
                draggable={false}
                onError={() => setFailed(url)}
              />
            ) : (
              <p className="knitting-shelf-calm" role="status">
                This picture isn&apos;t ready right now.
              </p>
            )}
          </div>
          {count > 1 && (
            <TurnControls
              noun="picture"
              position={`${shown + 1} of ${count}`}
              atStart={shown === 0}
              atEnd={shown === count - 1}
              onTurn={(step) => go(shown + step)}
            />
          )}
        </div>
        <div ref={words} className="knitting-ravelry-words">
          {pattern.designer && <p className="knitting-ravelry-by">By {pattern.designer}</p>}
          {pattern.facts.length > 0 && (
            <dl className="knitting-ravelry-facts">
              {pattern.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {/* Plain words only: this text came from the internet and is never treated as HTML. */}
          {pattern.notes && <p className="knitting-ravelry-notes">{pattern.notes}</p>}
        </div>
      </div>
    </div>
  )
}
