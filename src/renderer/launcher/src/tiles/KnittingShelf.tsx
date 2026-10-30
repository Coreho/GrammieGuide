import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { zLayers } from '@shared/zLayers'
import type { HomeKnitting, RowDirection } from '@shared/knitting/knitting'
import type { BuiltinViewProps } from './builtins'
import { ProjectCard, ProjectView } from './KnittingProject'
import { PatternList, PatternViewer, PatternsCard } from './KnittingPatterns'
import './KnittingShelf.css'

type Loaded =
  { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; knitting: HomeKnitting }

type View =
  /** `focus` names the card to land on when she comes back to the shelf. */
  | { kind: 'shelf'; focus?: 'project' | 'patterns' }
  | { kind: 'project' }
  | { kind: 'patterns'; focus?: string }
  | { kind: 'pattern'; id: string; from: 'shelf' | 'project' | 'patterns' }

const BACK_LABELS = {
  shelf: 'Back to Knitting',
  project: 'Back to my project',
  patterns: 'Back to patterns'
} as const

/**
 * Opens like the News shelf: one large card per part of her knitting. Only
 * parts the caregiver has set up get a card. The row count and pattern pages
 * live in main, so a reloaded or recovered Home shows the same row and page.
 */
export function KnittingShelf({ tile, onClose, musicStop }: BuiltinViewProps) {
  const surface = useRef<HTMLElement>(null)
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [view, setView] = useState<View>({ kind: 'shelf' })

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
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
  const patterns = loaded.state === 'ready' ? loaded.knitting.patterns : []
  const openPattern = view.kind === 'pattern' ? patterns.find((p) => p.id === view.id) : undefined

  // The caregiver removed what she had open: back to the shelf, which says what's left.
  useEffect(() => {
    if (loaded.state !== 'ready') return
    if (
      (view.kind === 'project' && !project) ||
      (view.kind === 'patterns' && patterns.length === 0) ||
      (view.kind === 'pattern' && !openPattern)
    ) {
      setView({ kind: 'shelf' })
    }
  }, [loaded.state, view, project, patterns.length, openPattern])

  // Each view starts on its way back; returning to a list lands on the card she left.
  useEffect(() => {
    const target =
      (view.kind === 'shelf' && view.focus && `[data-knitting-card="${view.focus}"]`) ||
      (view.kind === 'patterns' && view.focus && `[data-pattern-card="${view.focus}"]`) ||
      '.knitting-shelf-nav'
    surface.current?.querySelector<HTMLElement>(target)?.focus()
  }, [view])

  const goBack = useCallback((): void => {
    setView((current) => {
      switch (current.kind) {
        case 'project':
          return { kind: 'shelf', focus: 'project' }
        case 'patterns':
          return { kind: 'shelf', focus: 'patterns' }
        case 'pattern':
          if (current.from === 'project') return { kind: 'project' }
          if (current.from === 'patterns') return { kind: 'patterns', focus: current.id }
          return { kind: 'shelf', focus: 'patterns' }
        default:
          return current
      }
    })
  }, [])

  const count = useCallback(async (direction: RowDirection): Promise<void> => {
    try {
      const knitting = await window.launcher.changeKnittingRows(direction)
      setLoaded({ state: 'ready', knitting })
    } catch {
      // The count on screen stays what main last confirmed; the next tap tries again.
    }
  }, [])

  const rememberPage = useCallback((patternId: string, page: number): void => {
    // Main saves it for the next start; the copy here makes it reopen there this time too.
    setLoaded((current) =>
      current.state === 'ready'
        ? {
            state: 'ready',
            knitting: {
              ...current.knitting,
              patterns: current.knitting.patterns.map((pattern) =>
                pattern.id === patternId ? { ...pattern, lastPage: page } : pattern
              )
            }
          }
        : current
    )
    // Best effort: a failed save only means it reopens a page earlier after a restart.
    void window.launcher.rememberPatternPage(patternId, page).catch(() => {})
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (view.kind === 'shelf') onClose()
      else goBack()
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

  function openPatterns(): void {
    if (patterns.length === 1) setView({ kind: 'pattern', id: patterns[0]!.id, from: 'shelf' })
    else setView({ kind: 'patterns' })
  }

  const linked = project?.patternId && patterns.some((p) => p.id === project.patternId)

  let content
  if (view.kind === 'project' && project) {
    content = (
      <ProjectView
        project={project}
        onBack={goBack}
        onHome={onClose}
        onCount={(direction) => void count(direction)}
        onPattern={
          linked
            ? () => setView({ kind: 'pattern', id: project.patternId!, from: 'project' })
            : undefined
        }
        musicStop={musicStop}
      />
    )
  } else if (view.kind === 'patterns' && patterns.length) {
    content = (
      <PatternList
        patterns={patterns}
        onOpen={(id) => setView({ kind: 'pattern', id, from: 'patterns' })}
        onBack={goBack}
        onHome={onClose}
        musicStop={musicStop}
      />
    )
  } else if (view.kind === 'pattern' && openPattern) {
    content = (
      <PatternViewer
        key={openPattern.id}
        pattern={openPattern}
        backLabel={BACK_LABELS[view.from]}
        onBack={goBack}
        onHome={onClose}
        onPage={(page) => rememberPage(openPattern.id, page)}
        musicStop={musicStop}
      />
    )
  } else {
    content = (
      <>
        <header className="knitting-shelf-header">
          <button className="knitting-shelf-nav" onClick={onClose}>
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
        {loaded.state === 'ready' && !project && !patterns.length && (
          <p className="knitting-shelf-calm" role="status">
            Your knitting will be here once your family sets it up.
          </p>
        )}
        {(project || patterns.length > 0) && (
          <div className="knitting-shelf-grid">
            {project && (
              <ProjectCard project={project} onOpen={() => setView({ kind: 'project' })} />
            )}
            {patterns.length > 0 && <PatternsCard patterns={patterns} onOpen={openPatterns} />}
          </div>
        )}
      </>
    )
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
        {content}
      </section>
    </div>
  )
}
