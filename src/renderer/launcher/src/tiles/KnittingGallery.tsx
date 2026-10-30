import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { HomePiece } from '@shared/knitting/knitting'
import { KnittingPicture } from './KnittingProject'
import { TurnControls } from './KnittingPatterns'

export function GalleryCard({ pieces, onOpen }: { pieces: HomePiece[]; onOpen: () => void }) {
  const detail = pieces.length === 1 ? pieces[0]!.what : `${pieces.length} pieces`
  return (
    <button
      className="knitting-card"
      data-knitting-card="gallery"
      aria-label={`My knitting: ${detail}`}
      onClick={onOpen}
    >
      <span className="knitting-card-picture" aria-hidden="true">
        <KnittingPicture source={pieces[0]?.thumbnailUrl} />
      </span>
      <span className="knitting-card-label">
        <span className="knitting-card-title">My knitting</span>
        <span className="knitting-card-detail">{detail}</span>
      </span>
    </button>
  )
}

/**
 * Her finished pieces, one at a time and as large as the screen allows, with what
 * it is and who it went to underneath, to look through and show visitors. A piece
 * whose photo is gone keeps its caption and gets a calm line in place of the picture.
 */
export function GalleryViewer({
  pieces,
  onBack,
  onHome,
  musicStop
}: {
  pieces: HomePiece[]
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const count = pieces.length
  // The caregiver can remove pieces while she looks; stay within what is left.
  const shown = Math.min(index, count - 1)
  const piece = pieces[shown]!

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
    }
  }

  return (
    <div className="knitting-view" onKeyDown={onKeyDown}>
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          Back to Knitting
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1>My knitting</h1>
        {musicStop}
      </header>
      <figure className="knitting-piece">
        <div className="knitting-piece-picture">
          {piece.url && failed !== piece.url ? (
            <img
              key={piece.url}
              src={piece.url}
              alt={piece.what}
              draggable={false}
              onError={() => setFailed(piece.url!)}
            />
          ) : (
            <p className="knitting-shelf-calm" role="status">
              This picture isn&apos;t ready right now.
            </p>
          )}
        </div>
        <figcaption className="knitting-piece-caption">
          <span className="knitting-piece-what">{piece.what}</span>
          {piece.forWhom && <span className="knitting-piece-for">For {piece.forWhom}</span>}
        </figcaption>
      </figure>
      <TurnControls
        noun="piece"
        position={`${shown + 1} of ${count}`}
        atStart={shown === 0}
        atEnd={shown === count - 1}
        onTurn={(step) => go(shown + step)}
      />
    </div>
  )
}
