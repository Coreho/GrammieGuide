import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type {
  RavelryBrowseResult,
  RavelryCategoriesResult,
  RavelryPreviewResult,
  RavelrySaveResult
} from '@shared/knitting/ravelry'
import { KnittingPicture } from './KnittingProject'
import { TurnControls } from './KnittingPatterns'
import { RavelryPatternBody } from './KnittingRavelry'

type Level =
  | { kind: 'categories' }
  | { kind: 'category'; id: string; label: string; page: number; focus?: number }
  | { kind: 'pattern'; ravelryId: number; from: Extract<Level, { kind: 'category' }> }

const NOT_FOUND = "Patterns can't be found right now."

function useLoad<T>(
  load: () => Promise<T>,
  key: string
): {
  result: T | 'loading' | 'failed'
  retry: () => void
} {
  const [result, setResult] = useState<T | 'loading' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setResult('loading')
    load().then(
      (value) => {
        if (live) setResult(value)
      },
      () => {
        if (live) setResult('failed')
      }
    )
    return () => {
      live = false
    }
    // The key says what is being loaded; `load` is a fresh closure every render.
  }, [key, attempt])
  return { result, retry: useCallback(() => setAttempt((value) => value + 1), []) }
}

function Calm({ line, onRetry }: { line: string; onRetry?: () => void }) {
  return (
    <div className="knitting-ravelry-calm">
      <p className="knitting-shelf-calm" role="status">
        {line}
      </p>
      {onRetry && (
        <button className="knitting-add-row" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

/**
 * Finding a pattern without Ravelry's website: large category pictures, then a few patterns at a
 * time, then one pattern with one large Save button. She never types, and never meets a menu, a
 * login or a shop. Everything here is drawn by Home from data main fetched.
 */
export function RavelryFind({
  savedIds,
  onBack,
  onHome,
  musicStop
}: {
  savedIds: ReadonlySet<number>
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  const [level, setLevel] = useState<Level>({ kind: 'categories' })
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const focus = level.kind === 'category' ? level.focus : undefined
    const target = focus ? `[data-ravelry-find="${focus}"]` : '.knitting-shelf-nav'
    // The card she came from may still be loading; Esc must keep reaching this screen meanwhile.
    const found = root.current?.querySelector<HTMLElement>(target)
    ;(found ?? root.current)?.focus()
  }, [level])

  function back(): void {
    if (level.kind === 'pattern') setLevel({ ...level.from, focus: level.ravelryId })
    else if (level.kind === 'category') setLevel({ kind: 'categories' })
    else onBack()
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape') return
    // Steps back inside this screen; the shelf only hears it when there's nothing left to step.
    event.preventDefault()
    event.stopPropagation()
    back()
  }

  const backLabel =
    level.kind === 'pattern'
      ? `Back to ${level.from.label}`
      : level.kind === 'category'
        ? 'Back to all patterns'
        : 'Back to Ravelry'
  const title =
    level.kind === 'category' ? level.label : level.kind === 'categories' ? 'Find a pattern' : null

  return (
    <div ref={root} className="knitting-view" tabIndex={-1} onKeyDown={onKeyDown}>
      {level.kind !== 'pattern' && (
        <header className="knitting-shelf-header">
          <button className="knitting-shelf-nav" onClick={back}>
            {backLabel}
          </button>
          <button className="knitting-shelf-nav" onClick={onHome}>
            🏠 Home
          </button>
          <h1>{title}</h1>
          {musicStop}
        </header>
      )}
      {level.kind === 'categories' && (
        <Categories onOpen={(id, label) => setLevel({ kind: 'category', id, label, page: 1 })} />
      )}
      {level.kind === 'category' && (
        <Results
          category={level}
          savedIds={savedIds}
          onOpen={(ravelryId) => setLevel({ kind: 'pattern', ravelryId, from: level })}
          onTurn={(page) => setLevel({ ...level, page, focus: undefined })}
        />
      )}
      {level.kind === 'pattern' && (
        <Preview
          ravelryId={level.ravelryId}
          saved={savedIds.has(level.ravelryId)}
          backLabel={backLabel}
          onBack={back}
          onHome={onHome}
          musicStop={musicStop}
        />
      )}
    </div>
  )
}

function Categories({ onOpen }: { onOpen: (id: string, label: string) => void }) {
  const { result, retry } = useLoad<RavelryCategoriesResult>(
    () => window.launcher.ravelryCategories(),
    'categories'
  )
  if (result === 'loading') return <Calm line="Getting patterns…" />
  if (result === 'failed' || !result.ok) return <Calm line={NOT_FOUND} onRetry={retry} />
  return (
    <div className="knitting-ravelry-categories">
      {result.categories.map((category) => (
        <button
          key={category.id}
          className="knitting-card knitting-ravelry-category"
          data-ravelry-category={category.id}
          onClick={() => onOpen(category.id, category.label)}
        >
          <span className="knitting-card-picture" aria-hidden="true">
            <KnittingPicture source={category.thumbnailUrl} />
          </span>
          <span className="knitting-card-title">{category.label}</span>
        </button>
      ))}
    </div>
  )
}

function Results({
  category,
  savedIds,
  onOpen,
  onTurn
}: {
  category: { id: string; page: number; focus?: number }
  savedIds: ReadonlySet<number>
  onOpen: (ravelryId: number) => void
  onTurn: (page: number) => void
}) {
  const { result, retry } = useLoad<RavelryBrowseResult>(
    () => window.launcher.ravelryBrowse(category.id, category.page),
    `${category.id}:${category.page}`
  )
  // Coming back from a pattern lands on its card, once the page has loaded again.
  const shelf = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (category.focus) {
      shelf.current?.querySelector<HTMLElement>(`[data-ravelry-find="${category.focus}"]`)?.focus()
    }
  }, [result, category.focus])
  if (result === 'loading') return <Calm line="Getting patterns…" />
  if (result === 'failed' || !result.ok) return <Calm line={NOT_FOUND} onRetry={retry} />
  if (result.items.length === 0) return <Calm line="There are no more patterns here." />
  return (
    <>
      <div ref={shelf} className="knitting-shelf-grid">
        {result.items.map((item) => (
          <button
            key={item.ravelryId}
            className="knitting-card"
            data-ravelry-find={item.ravelryId}
            onClick={() => onOpen(item.ravelryId)}
          >
            <span className="knitting-card-picture" aria-hidden="true">
              <KnittingPicture source={item.thumbnailUrl} />
            </span>
            <span className="knitting-card-label">
              <span className="knitting-card-title knitting-ravelry-card-title">{item.name}</span>
              <span className="knitting-card-detail">
                {savedIds.has(item.ravelryId) ? '✓ Saved' : item.designer}
              </span>
            </span>
          </button>
        ))}
      </div>
      <TurnControls
        noun="page"
        position={`Page ${result.page}`}
        atStart={result.page <= 1}
        atEnd={result.page >= result.lastPage}
        onTurn={(step) => {
          const next = result.page + step
          if (next >= 1 && next <= result.lastPage) onTurn(next)
        }}
      />
    </>
  )
}

function Preview({
  ravelryId,
  saved,
  backLabel,
  onBack,
  onHome,
  musicStop
}: {
  ravelryId: number
  saved: boolean
  backLabel: string
  onBack: () => void
  onHome: () => void
  musicStop?: ReactNode
}) {
  const { result, retry } = useLoad<RavelryPreviewResult>(
    () => window.launcher.ravelryPattern(ravelryId),
    String(ravelryId)
  )
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<RavelrySaveResult | null>(null)

  async function save(): Promise<void> {
    if (saving || saved || outcome?.ok) return
    setSaving(true)
    setOutcome(null)
    try {
      setOutcome(await window.launcher.saveRavelry(ravelryId))
    } catch {
      setOutcome({ ok: false, reason: 'unavailable' })
    } finally {
      setSaving(false)
    }
  }

  const ready = result !== 'loading' && result !== 'failed' && result.ok ? result : null
  const header = (
    <header className="knitting-shelf-header">
      <button className="knitting-shelf-nav" onClick={onBack}>
        {backLabel}
      </button>
      <button className="knitting-shelf-nav" onClick={onHome}>
        🏠 Home
      </button>
      {ready && <h1 className="knitting-pattern-title">{ready.name}</h1>}
      {musicStop}
    </header>
  )
  if (result === 'loading') {
    return (
      <>
        {header}
        <Calm line="Getting this pattern…" />
      </>
    )
  }
  if (!ready) {
    return (
      <>
        {header}
        <Calm line="This pattern can't be shown right now." onRetry={retry} />
      </>
    )
  }
  const isSaved = saved || outcome?.ok === true
  return (
    <>
      {header}
      <RavelryPatternBody
        name={ready.name}
        designer={ready.designer}
        facts={ready.facts}
        notes={ready.notes}
        pictures={ready.pictures.map((url) => ({ url }))}
        action={
          <>
            <button
              className="knitting-add-row"
              data-ravelry-save
              // aria-disabled, not disabled: a disabled button drops the keyboard focus it holds,
              // and Esc stops reaching this screen. save() ignores a press while it can't act.
              aria-disabled={saving || isSaved}
              onClick={() => void save()}
            >
              {isSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save this pattern'}
            </button>
            {outcome?.ok && (
              <p className="knitting-ravelry-saved-line" role="status">
                {outcome.withInstructions
                  ? "It's in My saved patterns, with its instructions."
                  : "It's in My saved patterns. Your family can add the instructions."}
              </p>
            )}
            {outcome && !outcome.ok && (
              <p className="knitting-ravelry-saved-line" role="status">
                {outcome.reason === 'full'
                  ? 'Your pattern shelf is full. Your family can make room.'
                  : "This pattern couldn't be saved right now."}
              </p>
            )}
          </>
        }
      />
    </>
  )
}
