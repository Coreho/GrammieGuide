import { useState, type ReactNode } from 'react'
import type { HomeKnitting, RowDirection } from '@shared/knitting/knitting'
import { KnittingIcon } from '../icons'

export type Project = NonNullable<HomeKnitting['project']>

/** A picture that falls back to the yarn icon when it is missing or fails to load. */
export function KnittingPicture({ source, large }: { source?: string; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  return source && failed !== source ? (
    <img src={source} alt="" draggable={false} onError={() => setFailed(source)} />
  ) : (
    <span className="knitting-picture-fallback">
      <KnittingIcon size={large ? 160 : 110} />
    </span>
  )
}

export function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <button
      className="knitting-card"
      data-knitting-card="project"
      aria-label={`My project: ${project.name}, row ${project.rows}`}
      onClick={onOpen}
    >
      <span className="knitting-card-picture" aria-hidden="true">
        <KnittingPicture source={project.thumbnailUrl} />
      </span>
      <span className="knitting-card-label">
        <span className="knitting-card-title">My project</span>
        <span className="knitting-card-detail">
          {project.name} · Row {project.rows}
        </span>
      </span>
    </button>
  )
}

export function ProjectView({
  project,
  onBack,
  onHome,
  onCount,
  onPattern,
  musicStop
}: {
  project: Project
  onBack: () => void
  onHome: () => void
  onCount: (direction: RowDirection) => void
  /** Present when the caregiver linked a saved pattern to this project. */
  onPattern?: () => void
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
        {onPattern && (
          <button className="knitting-shelf-nav" onClick={onPattern}>
            📄 Pattern
          </button>
        )}
        {musicStop}
      </header>
      <div className="knitting-project">
        <div className="knitting-project-picture" aria-hidden="true">
          <KnittingPicture source={project.photoUrl} large />
        </div>
        <div className="knitting-project-counter">
          <h1 className="knitting-project-name">{project.name}</h1>
          {project.forWhom && <p className="knitting-project-for">For {project.forWhom}</p>}
          <p className="knitting-project-rows" role="status" aria-live="polite">
            <span className="knitting-project-rows-label">Row</span>
            <span className="knitting-project-rows-count">{project.rows}</span>
          </p>
          <button className="knitting-add-row" data-dim-pass-through onClick={() => onCount('add')}>
            + Add a row
          </button>
          <button
            className="knitting-remove-row"
            data-dim-pass-through
            disabled={project.rows === 0}
            onClick={() => onCount('remove')}
          >
            − Take one away
          </button>
        </div>
      </div>
    </>
  )
}
