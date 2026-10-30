import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { zLayers } from '@shared/zLayers'
import type { HomeKnitting, RowDirection } from '@shared/knitting/knitting'
import { KnittingIcon } from '../icons'
import type { BuiltinViewProps } from './builtins'
import './KnittingShelf.css'

type Project = NonNullable<HomeKnitting['project']>
type Loaded =
  { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; knitting: HomeKnitting }

/**
 * Opens like the News shelf: one large card per part of her knitting. Only
 * parts the caregiver has set up get a card. The row count lives in main, so a
 * reloaded or recovered Home shows the same row she left it on.
 */
export function KnittingShelf({ tile, onClose, musicStop }: BuiltinViewProps) {
  const surface = useRef<HTMLElement>(null)
  const homeButton = useRef<HTMLButtonElement>(null)
  const projectCard = useRef<HTMLButtonElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [view, setView] = useState<'shelf' | 'project'>('shelf')

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    homeButton.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    let live = true
    let request = 0
    const refresh = (): void => {
      const sequence = ++request
      window.launcher.getKnitting().then(
        (knitting) => {
          if (live && sequence === request) setLoaded({ state: 'ready', knitting })
        },
        () => {
          if (live && sequence === request) setLoaded({ state: 'unavailable' })
        }
      )
    }
    refresh()
    const offKnitting = window.launcher.onKnittingChanged(refresh)
    const offPhotos = window.launcher.onPhotosChanged(refresh)
    return () => {
      live = false
      offKnitting()
      offPhotos()
    }
  }, [])

  const project = loaded.state === 'ready' ? loaded.knitting.project : null

  // The caregiver removed the project while she had it open: back to the shelf's calm line.
  useEffect(() => {
    if (view === 'project' && loaded.state === 'ready' && !project) setView('shelf')
  }, [view, loaded.state, project])

  useEffect(() => {
    if (view === 'project') backButton.current?.focus()
  }, [view])

  const showShelf = useCallback(() => {
    setView('shelf')
    // Wait for the shelf to render before returning focus to her project card.
    requestAnimationFrame(() => (projectCard.current ?? homeButton.current)?.focus())
  }, [])

  const count = useCallback(async (direction: RowDirection): Promise<void> => {
    try {
      const knitting = await window.launcher.changeKnittingRows(direction)
      setLoaded({ state: 'ready', knitting })
    } catch {
      // The count on screen stays what main last confirmed; the next tap tries again.
    }
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (view === 'project') showShelf()
      else onClose()
      return
    }
    if (event.key !== 'Tab') return
    const controls = Array.from(
      surface.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
    )
    const index = controls.indexOf(document.activeElement as HTMLButtonElement)
    if (event.shiftKey && index <= 0) {
      event.preventDefault()
      controls.at(-1)?.focus()
    } else if (!event.shiftKey && index === controls.length - 1) {
      event.preventDefault()
      controls[0]?.focus()
    }
  }

  return (
    <div className="knitting-shelf" style={{ zIndex: zLayers.knittingOverlay }}>
      <section
        ref={surface}
        className="knitting-shelf-surface"
        role="dialog"
        aria-modal="true"
        aria-label={tile.label}
        onKeyDown={onKeyDown}
      >
        {view === 'project' && project ? (
          <ProjectView
            project={project}
            backButton={backButton}
            onBack={showShelf}
            onHome={onClose}
            onCount={(direction) => void count(direction)}
            musicStop={musicStop}
          />
        ) : (
          <>
            <header className="knitting-shelf-header">
              <button ref={homeButton} className="knitting-shelf-nav" onClick={onClose}>
                Back to Home
              </button>
              <h1>{tile.label}</h1>
              {musicStop}
            </header>
            {loaded.state === 'loading' && (
              <p className="knitting-shelf-calm" role="status">
                Getting your knitting ready…
              </p>
            )}
            {loaded.state === 'unavailable' && (
              <p className="knitting-shelf-calm" role="status">
                Your knitting isn&apos;t ready right now.
              </p>
            )}
            {loaded.state === 'ready' && !project && (
              <p className="knitting-shelf-calm" role="status">
                Your knitting will be here once your family sets it up.
              </p>
            )}
            {project && (
              <div className="knitting-shelf-grid">
                <ProjectCard
                  project={project}
                  cardRef={projectCard}
                  onOpen={() => setView('project')}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function ProjectPicture({ project, large }: { project: Project; large?: boolean }) {
  const source = large ? project.photoUrl : project.thumbnailUrl
  const [failed, setFailed] = useState<string | null>(null)
  return source && failed !== source ? (
    <img src={source} alt="" draggable={false} onError={() => setFailed(source)} />
  ) : (
    <span className="knitting-picture-fallback">
      <KnittingIcon size={large ? 160 : 110} />
    </span>
  )
}

function ProjectCard({
  project,
  cardRef,
  onOpen
}: {
  project: Project
  cardRef: RefObject<HTMLButtonElement | null>
  onOpen: () => void
}) {
  return (
    <button
      ref={cardRef}
      className="knitting-card"
      data-knitting-card="project"
      aria-label={`My project: ${project.name}, row ${project.rows}`}
      onClick={onOpen}
    >
      <span className="knitting-card-picture" aria-hidden="true">
        <ProjectPicture project={project} />
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

function ProjectView({
  project,
  backButton,
  onBack,
  onHome,
  onCount,
  musicStop
}: {
  project: Project
  backButton: RefObject<HTMLButtonElement | null>
  onBack: () => void
  onHome: () => void
  onCount: (direction: RowDirection) => void
  musicStop?: ReactNode
}) {
  return (
    <>
      <header className="knitting-shelf-header">
        <button ref={backButton} className="knitting-shelf-nav" onClick={onBack}>
          Back to Knitting
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        {musicStop}
      </header>
      <div className="knitting-project">
        <div className="knitting-project-picture" aria-hidden="true">
          <ProjectPicture project={project} large />
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
