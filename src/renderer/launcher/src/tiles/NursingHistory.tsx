import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { zLayers } from '@shared/zLayers'
import {
  pageCount,
  type HomeNursing,
  type HomeNursingChapter,
  type HomeNursingPaper
} from '@shared/nursing/nursingHistory'
import type { BuiltinViewProps } from './builtins'
import { TurnControls } from './KnittingPatterns'
import './KnittingShelf.css'
import './NursingHistory.css'

type View =
  | { kind: 'shelf' }
  | { kind: 'chapter'; id: string }
  | { kind: 'paper'; chapterId: string; id: string }

type Loaded =
  { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; history: HomeNursing }

/**
 * Her nursing career, chapter by chapter, with the papers she kept from each time: a shelf of
 * large chapter cards, a chapter's short story with a button per paper, and a paper one page at
 * a time. It looks and moves like the Knitting shelf on purpose, so it is something she
 * already knows how to use. Home only reads it; the caregiver loads it.
 */
export function NursingHistory({ tile, onClose, musicStop }: BuiltinViewProps) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [view, setView] = useState<View>({ kind: 'shelf' })
  const surface = useRef<HTMLElement>(null)

  useEffect(() => {
    let live = true
    window.launcher.getNursingHistory().then(
      (history) => live && setLoaded({ state: 'ready', history }),
      () => live && setLoaded({ state: 'unavailable' })
    )
    return () => {
      live = false
    }
  }, [])

  // Each view starts with its first control focused, so the keyboard and a screen reader land
  // somewhere sensible after every step.
  useEffect(() => {
    surface.current?.querySelector<HTMLElement>('button')?.focus()
  }, [view, loaded.state])

  const chapters = loaded.state === 'ready' ? loaded.history.chapters : []
  const chapter =
    view.kind === 'shelf'
      ? undefined
      : chapters.find((entry) => entry.id === (view.kind === 'chapter' ? view.id : view.chapterId))
  const paper =
    view.kind === 'paper' ? chapter?.papers.find((entry) => entry.id === view.id) : undefined

  function goBack(): void {
    if (view.kind === 'paper') setView({ kind: 'chapter', id: view.chapterId })
    else if (view.kind === 'chapter') setView({ kind: 'shelf' })
    else onClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      goBack()
    }
  }

  let content
  if (paper && chapter) {
    content = (
      <PaperViewer
        key={paper.id}
        paper={paper}
        onBack={goBack}
        onHome={onClose}
        musicStop={musicStop}
      />
    )
  } else if (chapter) {
    content = (
      <ChapterView
        chapter={chapter}
        onOpen={(id) => setView({ kind: 'paper', chapterId: chapter.id, id })}
        onBack={goBack}
        onHome={onClose}
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
            Getting your nursing history ready…
          </p>
        )}
        {loaded.state === 'unavailable' && (
          <p className="knitting-shelf-calm" role="status">
            Your nursing history isn&apos;t ready right now.
          </p>
        )}
        {loaded.state === 'ready' && chapters.length === 0 && (
          <p className="knitting-shelf-calm" role="status">
            Your nursing history will be here once your family adds it.
          </p>
        )}
        {chapters.length > 0 && (
          <ul className="nursing-chapters" aria-label="Chapters of your nursing career">
            {chapters.map((entry) => (
              <li key={entry.id}>
                <button
                  className="knitting-card nursing-chapter-card"
                  onClick={() => setView({ kind: 'chapter', id: entry.id })}
                >
                  <span className="knitting-card-title">{entry.title}</span>
                  {entry.years && <span className="knitting-card-detail">{entry.years}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="knitting-shelf" style={{ zIndex: zLayers.nursingOverlay }}>
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

function ChapterView({
  chapter,
  onOpen,
  onBack,
  onHome,
  musicStop
}: {
  chapter: HomeNursingChapter
  onOpen: (paperId: string) => void
  onBack: () => void
  onHome: () => void
  musicStop?: React.ReactNode
}) {
  return (
    <div className="knitting-view nursing-chapter">
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          Back to the chapters
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1 className="knitting-pattern-title">{chapter.title}</h1>
        {musicStop}
      </header>
      <div className="nursing-chapter-body">
        {(chapter.years || chapter.story) && (
          <article className="nursing-story">
            {chapter.years && <p className="nursing-story-years">{chapter.years}</p>}
            {chapter.story && <p className="nursing-story-text">{chapter.story}</p>}
          </article>
        )}
        {chapter.papers.length > 0 && (
          <section className="nursing-papers" aria-label="Her papers from this time">
            <h2>Papers from this time</h2>
            <ul>
              {chapter.papers.map((entry) => (
                <li key={entry.id}>
                  <button className="nursing-paper" onClick={() => onOpen(entry.id)}>
                    <span className="nursing-paper-title">{entry.title}</span>
                    <span className="nursing-paper-detail">
                      {[entry.note, pageCount(entry.pages.length)].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

/** One page at a time, as large as the screen allows; a missing page gets a calm line. */
function PaperViewer({
  paper,
  onBack,
  onHome,
  musicStop
}: {
  paper: HomeNursingPaper
  onBack: () => void
  onHome: () => void
  musicStop?: React.ReactNode
}) {
  const [page, setPage] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const count = paper.pages.length
  const url = paper.pages[page] ?? null

  function go(next: number): void {
    if (next < 0 || next >= count) return
    setPage(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(page + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(page - 1)
    }
  }

  return (
    <div className="knitting-view" onKeyDown={onKeyDown}>
      <header className="knitting-shelf-header">
        <button className="knitting-shelf-nav" onClick={onBack}>
          Back to this chapter
        </button>
        <button className="knitting-shelf-nav" onClick={onHome}>
          🏠 Home
        </button>
        <h1 className="knitting-pattern-title">{paper.title}</h1>
        {musicStop}
      </header>
      <div className="knitting-pattern-page">
        {url && failed !== url ? (
          <img
            key={url}
            src={url}
            alt={`${paper.title}, page ${page + 1} of ${count}`}
            draggable={false}
            onError={() => setFailed(url)}
          />
        ) : (
          <p className="knitting-shelf-calm" role="status">
            This page isn&apos;t ready right now.
          </p>
        )}
      </div>
      {count > 1 && (
        <TurnControls
          noun="page"
          position={`Page ${page + 1} of ${count}`}
          atStart={page === 0}
          atEnd={page === count - 1}
          onTurn={(step) => go(page + step)}
        />
      )}
    </div>
  )
}
