import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  MAX_NURSING_CHAPTERS,
  MAX_NURSING_PAPERS,
  NURSING_NOTE_MAX,
  NURSING_PAPER_TITLE_MAX,
  NURSING_STORY_MAX,
  NURSING_TITLE_MAX,
  NURSING_YEARS_MAX,
  chapterDetail,
  pageCount,
  type AdminNursing,
  type AdminNursingChapter,
  type AdminNursingPaper,
  type NursingMove
} from '@shared/nursing/nursingHistory'
import type { Tile } from '@shared/configSchema'
import { useConfigStore } from '../state/useConfigStore'
import './NursingTab.css'

type Words = { title: string; years: string; story: string }
const NEW = 'new'
const blank: Words = { title: '', years: '', story: '' }
const wordsOf = (chapter: AdminNursingChapter | undefined): Words =>
  chapter ? { title: chapter.title, years: chapter.years, story: chapter.story } : blank
const NOTE_SUGGESTIONS = [
  'Her own paper',
  'For her students',
  'A letter about her',
  'From her school'
]

const isNursingTile = (tile: Tile): boolean =>
  tile.type === 'builtin' && tile.builtinKey === 'nursing'

/** Main's messages are written for the caregiver; drop Electron's IPC prefix. */
function mainMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback
}

/** Drawn chevrons and cross, one stroke weight; the buttons carry the words. */
function Glyph({ kind }: { kind: 'up' | 'down' | 'remove' }) {
  const path =
    kind === 'up'
      ? 'M5 12.5 10 7.5 15 12.5'
      : kind === 'down'
        ? 'M5 7.5 10 12.5 15 7.5'
        : 'M6 6l8 8M14 6l-8 8'
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Count({ id, value, max }: { id: string; value: string; max: number }) {
  const near = value.length > max * 0.9
  return (
    <span id={id} className={near ? 'nursing-count is-near' : 'nursing-count'}>
      {value.length.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}

/**
 * Her nursing career for the Nursing History tile: chapters in career order on the left, the
 * chosen chapter's words and papers on the right. Everything lives in main's own file (not
 * config), and every change is saved straight away through main, which checks it.
 */
export function NursingTab() {
  const config = useConfigStore((s) => s.config)
  const [nursing, setNursing] = useState<AdminNursing | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Words>(blank)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    window.admin.getNursing().then(
      (result) => {
        if (!live) return
        setNursing(result)
        const first = result.chapters[0]
        setSelected(first?.id ?? null)
        setDraft(wordsOf(first))
      },
      () => live && setError('Could not load her nursing history. Try opening this tab again.')
    )
    return () => {
      live = false
    }
  }, [])

  const chapters = nursing?.chapters ?? []
  const chapter = chapters.find((entry) => entry.id === selected)
  const saved = selected === NEW ? blank : wordsOf(chapter)
  const dirty =
    draft.title.trim() !== saved.title ||
    draft.years.trim() !== saved.years ||
    draft.story.trim() !== saved.story
  const onHome = config?.tiles.some(isNursingTile) ?? false

  function choose(id: string | null): void {
    if (id === selected) return
    if (dirty && !window.confirm('Leave this chapter without saving your changes?')) return
    setSelected(id)
    setDraft(wordsOf(chapters.find((entry) => entry.id === id)))
    setMessage('')
    setError('')
  }

  /** Runs one change through main; the returned history replaces what is shown. */
  async function run(
    what: string,
    action: () => Promise<AdminNursing>,
    done: string,
    after?: (result: AdminNursing) => void
  ): Promise<boolean> {
    setBusy(what)
    setMessage('')
    setError('')
    try {
      const result = await action()
      setNursing(result)
      after?.(result)
      setMessage(done)
      return true
    } catch (failure) {
      setError(mainMessage(failure, 'Could not save. Check the details and try again.'))
      return false
    } finally {
      setBusy(null)
    }
  }

  function saveChapter(event: FormEvent): void {
    event.preventDefault()
    if (!draft.title.trim()) {
      setError(`Give the chapter a title (up to ${NURSING_TITLE_MAX} characters).`)
      return
    }
    const isNew = selected === NEW
    void run(
      'chapter',
      () =>
        window.admin.saveNursingChapter({
          ...draft,
          id: isNew ? undefined : (selected ?? undefined)
        }),
      isNew ? 'Chapter added. Now add the papers from that time.' : 'Chapter saved.',
      (result) => {
        const savedChapter = isNew
          ? result.chapters.at(-1)
          : result.chapters.find((c) => c.id === selected)
        setSelected(savedChapter?.id ?? null)
        setDraft(wordsOf(savedChapter))
      }
    )
  }

  function removeChapter(): void {
    if (!chapter) return
    const papers = chapter.papers.length
    const warning = papers
      ? `Remove “${chapter.title}” and its ${papers === 1 ? 'paper' : `${papers} papers`}? Their page pictures are deleted from her computer.`
      : `Remove “${chapter.title}”?`
    if (!window.confirm(warning)) return
    const at = chapters.findIndex((entry) => entry.id === chapter.id)
    void run(
      'chapter',
      () => window.admin.removeNursingChapter(chapter.id),
      'Chapter removed.',
      (result) => {
        const next = result.chapters[Math.min(at, result.chapters.length - 1)]
        setSelected(next?.id ?? null)
        setDraft(wordsOf(next))
      }
    )
  }

  function moveChapter(entry: AdminNursingChapter, direction: NursingMove): void {
    void run(
      `move-${entry.id}`,
      () => window.admin.moveNursingChapter(entry.id, direction),
      'Order saved.'
    )
  }

  return (
    <div className="nursing-tab">
      <header className="nursing-tab-head">
        <h2>Nursing History</h2>
        <p>
          Her nursing career as chapters, each with a short story written to her and the papers she
          kept from that time. She reads them on the Nursing History tile, one page at a time.
        </p>
        <p className={onHome ? 'nursing-home-state is-on' : 'nursing-home-state'}>
          {onHome
            ? 'The Nursing History tile is on her Home.'
            : 'Not on her Home yet: add Built-in → Nursing History in the Tiles tab.'}
        </p>
      </header>

      <div className="nursing-feedback" aria-live="polite">
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>

      <div className="nursing-editor">
        <nav className="nursing-chapter-list" aria-label="Chapters">
          <div className="nursing-pane-head">
            <h3>Chapters</h3>
            <span>
              {chapters.length} of {MAX_NURSING_CHAPTERS}
            </span>
          </div>
          {nursing && chapters.length === 0 && selected !== NEW && (
            <p className="nursing-empty">
              No chapters yet. Her tile says her history will be here once her family adds it.
            </p>
          )}
          <ol>
            {chapters.map((entry, index) => (
              <li key={entry.id} className={entry.id === selected ? 'is-current' : undefined}>
                <button
                  type="button"
                  className="nursing-chapter-pick"
                  aria-current={entry.id === selected ? 'true' : undefined}
                  onClick={() => choose(entry.id)}
                >
                  <span className="nursing-chapter-name">{entry.title}</span>
                  <span className="nursing-chapter-meta">
                    {chapterDetail(entry.years, entry.papers.length) || 'No years or papers yet'}
                  </span>
                </button>
                <span className="nursing-order">
                  <button
                    type="button"
                    className="nursing-icon"
                    aria-label={`Move ${entry.title} earlier`}
                    title="Move earlier"
                    disabled={index === 0 || busy !== null}
                    onClick={() => moveChapter(entry, 'earlier')}
                  >
                    <Glyph kind="up" />
                  </button>
                  <button
                    type="button"
                    className="nursing-icon"
                    aria-label={`Move ${entry.title} later`}
                    title="Move later"
                    disabled={index === chapters.length - 1 || busy !== null}
                    onClick={() => moveChapter(entry, 'later')}
                  >
                    <Glyph kind="down" />
                  </button>
                </span>
              </li>
            ))}
            {selected === NEW && (
              <li className="is-current">
                <span className="nursing-chapter-pick is-draft" aria-current="true">
                  <span className="nursing-chapter-name">
                    {draft.title.trim() || 'New chapter'}
                  </span>
                  <span className="nursing-chapter-meta">Not saved yet</span>
                </span>
              </li>
            )}
          </ol>
          <button
            type="button"
            className="nursing-button"
            disabled={
              !nursing ||
              busy !== null ||
              selected === NEW ||
              chapters.length >= MAX_NURSING_CHAPTERS
            }
            onClick={() => choose(NEW)}
          >
            Add a chapter
          </button>
        </nav>

        <section className="nursing-detail" aria-label="Chapter">
          {selected === null ? (
            <p className="nursing-empty">Choose a chapter, or add the first one.</p>
          ) : (
            <>
              <form onSubmit={saveChapter} className="nursing-chapter-form">
                <fieldset disabled={busy !== null}>
                  <legend>{selected === NEW ? 'New chapter' : 'Chapter'}</legend>
                  <div className="nursing-field-row">
                    <Field
                      label="Title"
                      inputId="nursing-chapter-title"
                      count={
                        <Count
                          id="nursing-title-count"
                          value={draft.title}
                          max={NURSING_TITLE_MAX}
                        />
                      }
                    >
                      <input
                        id="nursing-chapter-title"
                        aria-describedby="nursing-title-count"
                        required
                        maxLength={NURSING_TITLE_MAX}
                        value={draft.title}
                        placeholder="Columbia Presbyterian, New York"
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Years"
                      inputId="nursing-chapter-years"
                      hint="Plain words, as she would say them."
                    >
                      <input
                        id="nursing-chapter-years"
                        aria-describedby="nursing-chapter-years-hint"
                        maxLength={NURSING_YEARS_MAX}
                        value={draft.years}
                        placeholder="1967 – 1999"
                        onChange={(e) => setDraft({ ...draft, years: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Her story"
                    hint="Written to her (“You…”), in short plain sentences. Blank lines start a new paragraph."
                    inputId="nursing-chapter-story"
                    count={
                      <Count id="nursing-story-count" value={draft.story} max={NURSING_STORY_MAX} />
                    }
                  >
                    <textarea
                      id="nursing-chapter-story"
                      aria-describedby="nursing-story-count nursing-chapter-story-hint"
                      rows={11}
                      maxLength={NURSING_STORY_MAX}
                      value={draft.story}
                      onChange={(e) => setDraft({ ...draft, story: e.target.value })}
                    />
                  </Field>
                  <div className="nursing-actions">
                    <button
                      type="submit"
                      className="nursing-button is-primary"
                      disabled={!dirty && selected !== NEW}
                    >
                      {busy === 'chapter'
                        ? 'Saving…'
                        : selected === NEW
                          ? 'Add chapter'
                          : 'Save chapter'}
                    </button>
                    {dirty && <span className="nursing-unsaved">Unsaved changes</span>}
                    {selected === NEW ? (
                      <button
                        type="button"
                        className="nursing-button"
                        onClick={() => choose(chapters[0]?.id ?? null)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="nursing-button is-danger"
                        onClick={removeChapter}
                      >
                        Remove chapter
                      </button>
                    )}
                  </div>
                </fieldset>
                <aside className="nursing-preview" aria-label="How her chapter card looks on Home">
                  <span className="nursing-preview-label">On her Home</span>
                  <span className="nursing-preview-card">
                    <span className="nursing-preview-title">
                      {draft.title.trim() || 'Chapter title'}
                    </span>
                    {(draft.years.trim() || (chapter?.papers.length ?? 0) > 0) && (
                      <span className="nursing-preview-detail">
                        {chapterDetail(draft.years.trim(), chapter?.papers.length ?? 0)}
                      </span>
                    )}
                  </span>
                </aside>
              </form>

              {chapter ? (
                <Papers
                  chapter={chapter}
                  busy={busy}
                  run={run}
                  setBusy={setBusy}
                  setError={setError}
                  setMessage={setMessage}
                  setNursing={setNursing}
                />
              ) : (
                <p className="nursing-empty">
                  Add the chapter first, then the papers from that time.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** A label above its control, with an optional live count and a hint below. */
function Field({
  label,
  inputId,
  hint,
  count,
  children
}: {
  label: string
  inputId: string
  hint?: string
  count?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="nursing-field">
      <span className="nursing-field-label">
        <label htmlFor={inputId}>{label}</label>
        {count}
      </span>
      {children}
      {hint && (
        <span id={`${inputId}-hint`} className="nursing-hint">
          {hint}
        </span>
      )}
    </div>
  )
}

type Run = (
  what: string,
  action: () => Promise<AdminNursing>,
  done: string,
  after?: (result: AdminNursing) => void
) => Promise<boolean>

function Papers({
  chapter,
  busy,
  run,
  setBusy,
  setError,
  setMessage,
  setNursing
}: {
  chapter: AdminNursingChapter
  busy: string | null
  run: Run
  setBusy: (value: string | null) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
  setNursing: (value: AdminNursing) => void
}) {
  const [adding, setAdding] = useState({ title: '', note: '' })
  const [editing, setEditing] = useState<{ id: string; title: string; note: string } | null>(null)
  const full = chapter.papers.length >= MAX_NURSING_PAPERS

  async function addPaper(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!adding.title.trim()) {
      setError('Give the paper a title first, then choose its pages.')
      return
    }
    setBusy('paper')
    setMessage('')
    setError('')
    try {
      const result = await window.admin.addNursingPaper({ chapterId: chapter.id, ...adding })
      setNursing(result.nursing)
      if (result.added) {
        setAdding({ title: '', note: '' })
        setMessage(
          `Paper added with ${pageCount(result.added)}.` +
            (result.failed
              ? ` ${result.failed} ${result.failed === 1 ? 'picture' : 'pictures'} couldn't be read.`
              : '')
        )
      }
    } catch (failure) {
      setError(mainMessage(failure, 'Could not add the paper. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  function remove(paper: AdminNursingPaper): void {
    if (
      !window.confirm(
        `Remove “${paper.title}”? Its ${pageCount(paper.pageCount)} are deleted from her computer.`
      )
    )
      return
    void run('paper', () => window.admin.removeNursingPaper(chapter.id, paper.id), 'Paper removed.')
  }

  return (
    <section className="nursing-papers-admin" aria-labelledby="nursing-papers-heading">
      <div className="nursing-pane-head">
        <h3 id="nursing-papers-heading">Papers from this time</h3>
        <span>
          {chapter.papers.length} of {MAX_NURSING_PAPERS}
        </span>
      </div>
      {chapter.papers.length === 0 && (
        <p className="nursing-empty">No papers in this chapter yet.</p>
      )}
      <ol className="nursing-paper-list">
        {chapter.papers.map((paper, index) => (
          <li key={paper.id}>
            {paper.cover ? (
              <img className="nursing-thumb" src={paper.cover} alt="" />
            ) : (
              <span className="nursing-thumb is-blank" aria-hidden="true" />
            )}
            {editing?.id === paper.id ? (
              <form
                className="nursing-paper-edit"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(
                    'paper',
                    () =>
                      window.admin.saveNursingPaper({
                        chapterId: chapter.id,
                        id: paper.id,
                        title: editing.title,
                        note: editing.note
                      }),
                    'Paper saved.',
                    () => setEditing(null)
                  )
                }}
              >
                <label className="nursing-field">
                  <span className="nursing-field-label">Title</span>
                  <input
                    required
                    autoFocus
                    maxLength={NURSING_PAPER_TITLE_MAX}
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />
                </label>
                <label className="nursing-field">
                  <span className="nursing-field-label">Note under the title</span>
                  <input
                    list="nursing-note-ideas"
                    maxLength={NURSING_NOTE_MAX}
                    value={editing.note}
                    onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  />
                </label>
                <div className="nursing-actions">
                  <button
                    type="submit"
                    className="nursing-button is-primary"
                    disabled={busy !== null}
                  >
                    Save paper
                  </button>
                  <button type="button" className="nursing-button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="nursing-paper-words">
                <span className="nursing-paper-name">{paper.title}</span>
                <span className="nursing-paper-meta">
                  {[paper.note, pageCount(paper.pageCount)].filter(Boolean).join(' · ')}
                </span>
                {paper.missingPages > 0 && (
                  <span className="nursing-warning">
                    {paper.missingPages === 1 ? '1 page is' : `${paper.missingPages} pages are`}{' '}
                    missing. Remove the paper and add it again.
                  </span>
                )}
              </div>
            )}
            {editing?.id !== paper.id && (
              <span className="nursing-paper-tools">
                <button
                  type="button"
                  className="nursing-button is-small"
                  disabled={busy !== null}
                  onClick={() => setEditing({ id: paper.id, title: paper.title, note: paper.note })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="nursing-icon"
                  aria-label={`Move ${paper.title} earlier`}
                  title="Move earlier"
                  disabled={index === 0 || busy !== null}
                  onClick={() =>
                    void run(
                      'paper',
                      () => window.admin.moveNursingPaper(chapter.id, paper.id, 'earlier'),
                      'Order saved.'
                    )
                  }
                >
                  <Glyph kind="up" />
                </button>
                <button
                  type="button"
                  className="nursing-icon"
                  aria-label={`Move ${paper.title} later`}
                  title="Move later"
                  disabled={index === chapter.papers.length - 1 || busy !== null}
                  onClick={() =>
                    void run(
                      'paper',
                      () => window.admin.moveNursingPaper(chapter.id, paper.id, 'later'),
                      'Order saved.'
                    )
                  }
                >
                  <Glyph kind="down" />
                </button>
                <button
                  type="button"
                  className="nursing-icon is-danger"
                  aria-label={`Remove ${paper.title}`}
                  title="Remove"
                  disabled={busy !== null}
                  onClick={() => remove(paper)}
                >
                  <Glyph kind="remove" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      <form className="nursing-add-paper" onSubmit={addPaper} aria-busy={busy === 'paper'}>
        <fieldset disabled={busy !== null || full}>
          <legend>Add a paper</legend>
          <div className="nursing-field-row">
            <label className="nursing-field">
              <span className="nursing-field-label">Title</span>
              <input
                required
                maxLength={NURSING_PAPER_TITLE_MAX}
                placeholder="Curriculum vitae"
                value={adding.title}
                onChange={(e) => setAdding({ ...adding, title: e.target.value })}
              />
            </label>
            <label className="nursing-field">
              <span className="nursing-field-label">Note under the title</span>
              <input
                list="nursing-note-ideas"
                maxLength={NURSING_NOTE_MAX}
                placeholder="Her own paper"
                value={adding.note}
                onChange={(e) => setAdding({ ...adding, note: e.target.value })}
              />
            </label>
          </div>
          <div className="nursing-actions">
            <button type="submit" className="nursing-button is-primary">
              {busy === 'paper' ? 'Adding pages…' : 'Choose its pages…'}
            </button>
            <span className="nursing-hint">
              Pictures of each page (put in file-name order) or one PDF. Word files: save as PDF
              first.
            </span>
          </div>
        </fieldset>
        <datalist id="nursing-note-ideas">
          {NOTE_SUGGESTIONS.map((idea) => (
            <option key={idea} value={idea} />
          ))}
        </datalist>
      </form>
    </section>
  )
}
