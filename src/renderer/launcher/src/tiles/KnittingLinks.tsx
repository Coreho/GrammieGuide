import type { ReactNode } from 'react'
import type { KnittingLink } from '@shared/knitting/knittingLinks'
import { supportsVideoControls } from '@shared/browser/videoControls'
import { KnittingPicture } from './KnittingProject'

export const LINKS_TITLE = 'Videos and ideas'

/** Tells her what a button opens; a page with the large playback controls is a video. */
const kindOf = (link: KnittingLink): string =>
  supportsVideoControls(link.url) ? 'Video' : 'Website'

export function LinksCard({
  links,
  bar,
  disabled,
  onOpen
}: {
  links: KnittingLink[]
  /** The fifth card: a full-width bar under the four, so none of those move. */
  bar: boolean
  disabled: boolean
  onOpen: () => void
}) {
  const detail = links.length === 1 ? links[0]!.label : `${links.length} to choose from`
  return (
    <button
      className={bar ? 'knitting-card knitting-card-bar' : 'knitting-card'}
      data-knitting-card="links"
      aria-label={`${LINKS_TITLE}: ${detail}`}
      disabled={disabled}
      onClick={onOpen}
    >
      <span className="knitting-card-picture" aria-hidden="true">
        <KnittingPicture />
      </span>
      <span className="knitting-card-label">
        <span className="knitting-card-title">{LINKS_TITLE}</span>
        <span className="knitting-card-detail">{detail}</span>
      </span>
    </button>
  )
}

/** The caregiver's saved links as large buttons; each opens in her protected browser. */
export function LinkList({
  links,
  opening,
  failedName,
  onOpen,
  onBack,
  onHome,
  musicStop
}: {
  links: KnittingLink[]
  opening: boolean
  /** The link that just failed to open, named so she knows which one. */
  failedName?: string
  onOpen: (link: KnittingLink) => void
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
        <h1>{LINKS_TITLE}</h1>
        {musicStop}
      </header>
      <div className="knitting-link-grid">
        {links.map((link) => (
          <button
            key={link.id}
            className="knitting-card knitting-link"
            data-link-card={link.id}
            aria-label={`${link.label}: ${kindOf(link).toLowerCase()}`}
            disabled={opening}
            onClick={() => onOpen(link)}
          >
            <span className="knitting-card-title">{link.label}</span>
            <span className="knitting-card-detail">{kindOf(link)}</span>
          </button>
        ))}
      </div>
      {failedName && (
        <p className="knitting-shelf-status" role="status">
          {failedName} can&apos;t open right now.
        </p>
      )}
    </>
  )
}
