import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { HomeRavelryPattern } from '@shared/knitting/knitting'
import { KnittingPicture } from './KnittingProject'
import { TurnControls } from './KnittingPatterns'

const WEBSITE_DETAIL = 'Patterns and ideas online'

export function RavelryCard({
  patterns,
  canFind,
  disabled,
  onOpen
}: {
  patterns: HomeRavelryPattern[]
  canFind: boolean
  disabled: boolean
  onOpen: () => void
}) {
  const detail =
    patterns.length === 0
      ? canFind
        ? 'Find a pattern'
        : WEBSITE_DETAIL
      : patterns.length === 1
        ? patterns[0]!.name
        : `${patterns.length} patterns`
  return (
    <button
      className="knitting-card"
      data-knitting-card="ravelry"
      aria-label={`Ravelry: ${patterns.length === 0 ? detail.toLowerCase() : detail}`}
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

/**
 * The first screen behind the card: her saved patterns, finding a new one, and the real website
 * last. It only appears when there's more than one of these to choose between.
 */
export function RavelryHub({
  patterns,
  canFind,
  showWebsite,
  openingWebsite,
  websiteFailed,
  onSaved,
  onFind,
  onOpenWebsite,
  onBack,
  onHome,
  musicStop
}: {
  patterns: HomeRavelryPattern[]
  canFind: boolean
  showWebsite: boolean
  openingWebsite: boolean
  websiteFailed: boolean
  onSaved: () => void
  onFind: () => void
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
      <div className="knitting-shelf-grid">
        {patterns.length > 0 && (
          <button className="knitting-card" data-ravelry-card="saved" onClick={onSaved}>
            <span className="knitting-card-picture" aria-hidden="true">
              <KnittingPicture source={patterns[0]?.thumbnailUrl} />
            </span>
            <span className="knitting-card-label">
              <span className="knitting-card-title">My saved patterns</span>
              <span className="knitting-card-detail">
                {patterns.length === 1 ? '1 pattern' : `${patterns.length} patterns`}
              </span>
            </span>
          </button>
        )}
        {canFind && (
          <button className="knitting-card" data-ravelry-card="find" onClick={onFind}>
            <span className="knitting-card-picture" aria-hidden="true">
              <KnittingPicture />
            </span>
            <span className="knitting-card-label">
              <span className="knitting-card-title">Find a pattern</span>
              <span className="knitting-card-detail">Blankets, scarves, hats and more</span>
            </span>
          </button>
        )}
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

/** The patterns saved for her, by her or the caregiver. */
export function RavelryList({
  patterns,
  backLabel,
  onOpen,
  onBack,
  onHome,
  musicStop
}: {
  patterns: HomeRavelryPattern[]
  backLabel: string
  onOpen: (id: string) => void
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  return (
    <>
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          {backLabel}
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1>My saved patterns</h1>
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
      </div>
    </>
  )
}

/**
 * Pictures beside plain words, with one action that never scrolls away. Shared by a saved pattern
 * and one she is looking over, so the two look the same. The words came from the internet and are
 * only ever text here, never HTML.
 */
export function RavelryPatternBody({
  name,
  designer,
  facts,
  notes,
  pictures,
  action
}: {
  name: string
  designer: string
  facts: { label: string; value: string }[]
  notes: string
  pictures: { url?: string }[]
  action?: ReactNode
}) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const words = useRef<HTMLDivElement>(null)
  const count = pictures.length
  const shown = Math.min(index, Math.max(0, count - 1))
  const url = pictures[shown]?.url

  function go(next: number): void {
    if (next >= 0 && next < count) setIndex(next)
  }

  // On the whole view, not just this body: each view starts with focus on its Back button in the
  // header above, and the keys have to work from there too.
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const view = body.current?.parentElement
    if (!view) return
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const next = shown + (event.key === 'ArrowRight' ? 1 : -1)
        if (next >= 0 && next < count) setIndex(next)
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // The words scroll separately from the buttons, so the keys have to reach them too.
        event.preventDefault()
        words.current?.scrollBy({ top: event.key === 'ArrowDown' ? 160 : -160 })
      }
    }
    view.addEventListener('keydown', onKeyDown)
    return () => view.removeEventListener('keydown', onKeyDown)
  }, [shown, count])

  return (
    <div ref={body} className="knitting-ravelry-pattern">
      <div className="knitting-ravelry-pictures">
        <div className="knitting-piece-picture">
          {url && failed !== url ? (
            <img key={url} src={url} alt={name} draggable={false} onError={() => setFailed(url)} />
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
      <div className="knitting-ravelry-side">
        {action && <div className="knitting-ravelry-action">{action}</div>}
        <div ref={words} className="knitting-ravelry-words">
          {designer && <p className="knitting-ravelry-by">By {designer}</p>}
          {facts.length > 0 && (
            <dl className="knitting-ravelry-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {notes && <p className="knitting-ravelry-notes">{notes}</p>}
        </div>
      </div>
    </div>
  )
}

/** A saved pattern: nothing here needs the internet or Ravelry's website. */
export function RavelryViewer({
  pattern,
  onRead,
  onBack,
  onHome,
  musicStop
}: {
  pattern: HomeRavelryPattern
  onRead: () => void
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  return (
    <div className="knitting-view">
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          Back to my patterns
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1 className="knitting-pattern-title">{pattern.name}</h1>
        {musicStop}
      </header>
      <RavelryPatternBody
        name={pattern.name}
        designer={pattern.designer}
        facts={pattern.facts}
        notes={pattern.notes}
        pictures={pattern.pictures}
        action={
          pattern.pages.length > 0 ? (
            <button className="knitting-add-row" data-ravelry-read onClick={onRead}>
              Read the pattern
            </button>
          ) : (
            <p className="knitting-ravelry-saved-line">
              Your family can add the instructions for this one.
            </p>
          )
        }
      />
    </div>
  )
}
