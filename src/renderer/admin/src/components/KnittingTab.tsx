import { useEffect, useState, type FormEvent } from 'react'
import {
  MAX_PATTERN_PAGES,
  movePiece,
  type AdminKnitting,
  type PieceMove
} from '@shared/knitting/knitting'
import {
  KNITTING_LINK_LABEL_MAX,
  MAX_KNITTING_LINKS,
  knittingLinkSchema,
  type KnittingLink
} from '@shared/knitting/knittingLinks'
import type { Tile } from '@shared/configSchema'
import { useConfigStore } from '../state/useConfigStore'
import { RavelryPicker } from './RavelryPicker'
import { TilePhotoPicker } from './TilePhotoPicker'

type Draft = { name: string; forWhom: string; photoId?: string; patternId?: string }

const toDraft = (knitting: AdminKnitting): Draft => ({
  name: knitting.project?.name ?? '',
  forWhom: knitting.project?.forWhom ?? '',
  photoId: knitting.project?.photoId,
  patternId: knitting.project?.patternId
})

const isKnittingTile = (tile: Tile): boolean =>
  tile.type === 'builtin' && tile.builtinKey === 'knitting'

/** Main's knitting messages are written for the caregiver; drop Electron's IPC prefix. */
function mainMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback
}

/**
 * Her project, patterns and finished pieces live in their own main-process file, not
 * in config: Home updates the row count and her pattern page as she goes, and only
 * this tab can set them up, reorder, reset or remove them. The Ravelry switch and her
 * videos and ideas are the exception: they live on the tile, because the approved-sites
 * rule reads them from config.
 */
export function KnittingTab() {
  const config = useConfigStore((s) => s.config)
  const saveConfig = useConfigStore((s) => s.save)
  const [knitting, setKnitting] = useState<AdminKnitting | null>(null)
  const [draft, setDraft] = useState<Draft>({ name: '', forWhom: '' })
  const [patternName, setPatternName] = useState('')
  const [piece, setPiece] = useState({ what: '', forWhom: '' })
  const [link, setLink] = useState({ label: '', url: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    let first = true
    const refresh = (): void => {
      window.admin.getKnitting().then(
        (result) => {
          if (!live) return
          setKnitting(result)
          // Load the form once; later pushes (her rows) must not wipe a half-typed edit.
          if (first) setDraft(toDraft(result))
          first = false
        },
        () => {
          if (live) setError('Could not load her knitting. Try opening this tab again.')
        }
      )
    }
    refresh()
    const off = window.admin.onKnittingChanged(refresh)
    return () => {
      live = false
      off()
    }
  }, [])

  async function run(
    action: () => Promise<AdminKnitting>,
    done: string,
    { keepDraft = false } = {}
  ): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await action()
      setKnitting(result)
      if (keepDraft) {
        // A removed pattern can't stay chosen for her project.
        setDraft((current) =>
          result.patterns.some((pattern) => pattern.id === current.patternId)
            ? current
            : { ...current, patternId: undefined }
        )
      } else setDraft(toDraft(result))
      setMessage(done)
    } catch (failure) {
      setError(mainMessage(failure, 'Could not save. Check the details and try again.'))
    } finally {
      setBusy(false)
    }
  }

  function save(startNew: boolean): void {
    if (!draft.name.trim()) {
      setError('Say what she is making (up to 40 characters).')
      return
    }
    void run(
      () =>
        window.admin.saveKnittingProject({
          name: draft.name,
          forWhom: draft.forWhom,
          photoId: draft.photoId,
          patternId: draft.patternId,
          startNew
        }),
      startNew ? 'New project saved. Her row count starts at 0.' : 'Project saved.'
    )
  }

  async function addPattern(): Promise<void> {
    if (!patternName.trim()) {
      setError('Give the pattern a name (up to 40 characters).')
      return
    }
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await window.admin.addKnittingPattern(patternName)
      setKnitting(result.knitting)
      if (result.added) {
        setPatternName('')
        setMessage(
          `Pattern saved with ${result.added} ${result.added === 1 ? 'page' : 'pages'}.` +
            (result.failed
              ? ` ${result.failed} ${result.failed === 1 ? 'picture' : 'pictures'} couldn't be read.`
              : '')
        )
      }
    } catch (failure) {
      setError(mainMessage(failure, 'Could not add the pattern. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function addPiece(): Promise<void> {
    if (!piece.what.trim()) {
      setError('Say what the piece is (up to 40 characters).')
      return
    }
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await window.admin.addKnittingPiece(piece)
      setKnitting(result.knitting)
      if (result.added) {
        setPiece({ what: '', forWhom: '' })
        setMessage('Piece saved. She sees it first in My knitting.')
      }
    } catch (failure) {
      setError(mainMessage(failure, 'Could not add the piece. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function setRavelry(ravelry: boolean): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const latest = useConfigStore.getState().config!
      await saveConfig({
        tiles: latest.tiles.map((tile) => (isKnittingTile(tile) ? { ...tile, ravelry } : tile))
      })
      setMessage(
        ravelry ? 'Ravelry is on her Knitting shelf.' : 'Ravelry is off her Knitting shelf.'
      )
    } catch {
      setError('Could not save the Ravelry setting. Try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Saved on every Knitting tile, like the Ravelry switch, so each shelf shows the same links. */
  async function saveLinks(next: KnittingLink[], done: string): Promise<boolean> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const latest = useConfigStore.getState().config!
      await saveConfig({
        tiles: latest.tiles.map((tile) =>
          isKnittingTile(tile) ? { ...tile, knittingLinks: next } : tile
        )
      })
      setMessage(done)
      return true
    } catch {
      setError('Could not save her videos and ideas. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addLink(): Promise<void> {
    const parsed = knittingLinkSchema.safeParse({ id: crypto.randomUUID(), ...link })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the name and the address.')
      return
    }
    if (await saveLinks([...links, parsed.data], `${parsed.data.label} is on her Knitting shelf.`))
      setLink({ label: '', url: '' })
  }

  function moveLink(id: string, direction: PieceMove): void {
    void saveLinks(movePiece(links, id, direction), 'Order saved.')
  }

  const project = knitting?.project ?? null
  const patterns = knitting?.patterns ?? []
  const pieces = knitting?.pieces ?? []
  const knittingTiles = config?.tiles.filter(isKnittingTile) ?? []
  const links = knittingTiles.find((tile) => tile.knittingLinks?.length)?.knittingLinks ?? []

  return (
    <div>
      <h2>Knitting</h2>
      <p style={{ fontSize: '.9rem', color: '#555' }}>
        Add a <strong>Built-in → Knitting</strong> tile in the Tiles tab to show it on Home. Set up
        what she is knitting here; she counts her rows on Home.
      </p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      {project ? (
        <p>
          She is on <strong>row {project.rows}</strong> of {project.name}.
        </p>
      ) : (
        knitting && <p>No project yet. Home shows a calm message until you add one.</p>
      )}

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          save(false)
        }}
      >
        <fieldset disabled={!knitting || busy} style={{ display: 'grid', gap: 14, padding: 20 }}>
          <legend>Her current project</legend>
          <label>
            What she is making{' '}
            <input
              required
              maxLength={40}
              placeholder="Scarf"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Who it is for{' '}
            <input
              maxLength={40}
              placeholder="Tom"
              value={draft.forWhom}
              onChange={(e) => setDraft({ ...draft, forWhom: e.target.value })}
            />
          </label>
          <label>
            Pattern for this project{' '}
            <select
              value={draft.patternId ?? ''}
              onChange={(e) => setDraft({ ...draft, patternId: e.target.value || undefined })}
            >
              <option value="">No pattern</option>
              {patterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </option>
              ))}
            </select>
          </label>
          <TilePhotoPicker
            label="Project photo"
            photoId={draft.photoId}
            onChange={(photoId) => setDraft({ ...draft, photoId })}
          />
          <div>
            <button type="submit">{project ? 'Save changes' : 'Save project'}</button>{' '}
            {project && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Start a new project? Her row count goes back to 0.'))
                    save(true)
                }}
              >
                Save as a new project
              </button>
            )}
          </div>
        </fieldset>
      </form>

      {project && (
        <p style={{ marginTop: 16 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Reset her row count to 0? She is on row ${project.rows}.`))
                void run(() => window.admin.resetKnittingRows(), 'Row count reset to 0.')
            }}
          >
            Reset row count to 0
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Remove her project from Home? Her row count is not kept.'))
                void run(() => window.admin.removeKnittingProject(), 'Project removed.')
            }}
          >
            Remove project
          </button>
        </p>
      )}

      <section aria-labelledby="knitting-patterns-heading" style={{ marginTop: 28 }}>
        <h3 id="knitting-patterns-heading">Patterns</h3>
        <p style={{ fontSize: '.9rem', color: '#555' }}>
          Take a clear photo of each page, or save the pages as pictures, then choose them all at
          once (up to {MAX_PATTERN_PAGES}). Pages are shown in file-name order, so name them page1,
          page2 and so on. She sees one page at a time, filling the screen, and it reopens on the
          page she was reading.
        </p>
        <ul aria-label="Saved patterns" style={{ listStyle: 'none', padding: 0 }}>
          {patterns.map((pattern) => (
            <li
              key={pattern.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: 10,
                marginBottom: 8,
                border: '1px solid #ccc',
                borderRadius: 12
              }}
            >
              {pattern.thumbnailUrl && (
                <img
                  src={pattern.thumbnailUrl}
                  alt=""
                  style={{ width: 64, height: 80, objectFit: 'contain', background: '#fff' }}
                />
              )}
              <span style={{ flex: 1 }}>
                <strong>{pattern.name}</strong> · {pattern.pageCount}{' '}
                {pattern.pageCount === 1 ? 'page' : 'pages'}
              </span>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove pattern ${pattern.name}`}
                onClick={() => {
                  if (window.confirm(`Remove the pattern "${pattern.name}" and its pages?`))
                    void run(
                      () => window.admin.removeKnittingPattern(pattern.id),
                      'Pattern removed.',
                      { keepDraft: true }
                    )
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {knitting && patterns.length === 0 && <li>No patterns yet.</li>}
        </ul>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void addPattern()
          }}
        >
          <fieldset disabled={!knitting || busy} style={{ display: 'grid', gap: 14, padding: 20 }}>
            <legend>Add a pattern</legend>
            <label>
              Pattern name{' '}
              <input
                required
                maxLength={40}
                placeholder="Cable scarf"
                value={patternName}
                onChange={(e) => setPatternName(e.target.value)}
              />
            </label>
            <div>
              <button type="submit">Choose page pictures…</button>
            </div>
          </fieldset>
        </form>
      </section>

      <section aria-labelledby="knitting-pieces-heading" style={{ marginTop: 28 }}>
        <h3 id="knitting-pieces-heading">My knitting (her finished pieces)</h3>
        <p style={{ fontSize: '.9rem', color: '#555' }}>
          Add a photo of each piece she has finished, with what it is and who it was for. She pages
          through them on Home, newest first; move a piece earlier or later to change the order.
        </p>
        <ul aria-label="Finished pieces" style={{ listStyle: 'none', padding: 0 }}>
          {pieces.map((item, index) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: 10,
                marginBottom: 8,
                border: '1px solid #ccc',
                borderRadius: 12
              }}
            >
              {item.thumbnailUrl && (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  style={{ width: 80, height: 64, objectFit: 'contain', background: '#fff' }}
                />
              )}
              <span style={{ flex: 1 }}>
                <strong>{item.what}</strong>
                {item.forWhom && ` · for ${item.forWhom}`}
              </span>
              <button
                type="button"
                disabled={busy || index === 0}
                aria-label={`Move ${item.what} earlier`}
                onClick={() =>
                  void run(
                    () => window.admin.moveKnittingPiece(item.id, 'earlier'),
                    'Order saved.',
                    { keepDraft: true }
                  )
                }
              >
                Move earlier
              </button>
              <button
                type="button"
                disabled={busy || index === pieces.length - 1}
                aria-label={`Move ${item.what} later`}
                onClick={() =>
                  void run(() => window.admin.moveKnittingPiece(item.id, 'later'), 'Order saved.', {
                    keepDraft: true
                  })
                }
              >
                Move later
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove piece ${item.what}`}
                onClick={() => {
                  if (window.confirm(`Remove "${item.what}" and its photo from her gallery?`))
                    void run(() => window.admin.removeKnittingPiece(item.id), 'Piece removed.', {
                      keepDraft: true
                    })
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {knitting && pieces.length === 0 && <li>No finished pieces yet.</li>}
        </ul>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void addPiece()
          }}
        >
          <fieldset disabled={!knitting || busy} style={{ display: 'grid', gap: 14, padding: 20 }}>
            <legend>Add a finished piece</legend>
            <label>
              What it is{' '}
              <input
                required
                maxLength={40}
                placeholder="Blue cardigan"
                value={piece.what}
                onChange={(e) => setPiece({ ...piece, what: e.target.value })}
              />
            </label>
            <label>
              Who it was for{' '}
              <input
                maxLength={40}
                placeholder="Ella"
                value={piece.forWhom}
                onChange={(e) => setPiece({ ...piece, forWhom: e.target.value })}
              />
            </label>
            <div>
              <button type="submit">Choose a photo…</button>
            </div>
          </fieldset>
        </form>
      </section>

      <section aria-labelledby="knitting-ravelry-heading" style={{ marginTop: 28 }}>
        <h3 id="knitting-ravelry-heading">Ravelry</h3>
        <p style={{ fontSize: '.9rem', color: '#555' }}>
          Adds a Ravelry card to her Knitting shelf. It opens ravelry.com in her protected browser,
          where other sites stay blocked and nothing downloads. Ravelry needs an account: turn this
          on, tap the card on Home and sign in with Remember me ticked, so she doesn&apos;t meet the
          login page. Some people have reported headaches from Ravelry&apos;s design, so try it with
          her first.
        </p>
        <label>
          <input
            type="checkbox"
            disabled={knittingTiles.length === 0 || busy}
            checked={knittingTiles.some((tile) => tile.ravelry)}
            onChange={(e) => void setRavelry(e.target.checked)}
          />{' '}
          Show Ravelry on her Knitting shelf
        </label>
        {config && knittingTiles.length === 0 && <p>Add a Knitting tile in the Tiles tab first.</p>}
        {knitting && <RavelryPicker picks={knitting.ravelry} onChange={setKnitting} />}
      </section>

      <section aria-labelledby="knitting-links-heading" style={{ marginTop: 28 }}>
        <h3 id="knitting-links-heading">Videos and ideas</h3>
        <p style={{ fontSize: '.9rem', color: '#555' }}>
          Save knitting videos and websites she enjoys. They appear behind a Videos and ideas card
          on her Knitting shelf as large buttons with the name you give them, and open in her
          protected browser. Saving a link lets her move around that whole website; other websites
          stay blocked. YouTube videos get her large Play and Pause buttons.
        </p>
        <ul aria-label="Saved videos and ideas" style={{ listStyle: 'none', padding: 0 }}>
          {links.map((item, index) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: 10,
                marginBottom: 8,
                border: '1px solid #ccc',
                borderRadius: 12
              }}
            >
              <span style={{ flex: 1, overflowWrap: 'anywhere' }}>
                <strong>{item.label}</strong> · {new URL(item.url).hostname}
              </span>
              <button
                type="button"
                disabled={busy || index === 0}
                aria-label={`Move ${item.label} earlier`}
                onClick={() => moveLink(item.id, 'earlier')}
              >
                Move earlier
              </button>
              <button
                type="button"
                disabled={busy || index === links.length - 1}
                aria-label={`Move ${item.label} later`}
                onClick={() => moveLink(item.id, 'later')}
              >
                Move later
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${item.label}`}
                onClick={() => {
                  if (window.confirm(`Remove "${item.label}" from her Knitting shelf?`))
                    void saveLinks(
                      links.filter((saved) => saved.id !== item.id),
                      `${item.label} is off her Knitting shelf.`
                    )
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {config && knittingTiles.length > 0 && links.length === 0 && (
            <li>No videos or ideas yet.</li>
          )}
        </ul>
        {links.length >= MAX_KNITTING_LINKS ? (
          <p>Her shelf has room for {MAX_KNITTING_LINKS}. Remove one to add another.</p>
        ) : (
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              void addLink()
            }}
          >
            <fieldset
              disabled={knittingTiles.length === 0 || busy}
              style={{ display: 'grid', gap: 14, padding: 20 }}
            >
              <legend>Add a video or website</legend>
              <label>
                Name she sees{' '}
                <input
                  required
                  maxLength={KNITTING_LINK_LABEL_MAX}
                  placeholder="Cable stitch video"
                  value={link.label}
                  onChange={(e) => setLink({ ...link, label: e.target.value })}
                />
              </label>
              <label>
                Address{' '}
                <input
                  required
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={link.url}
                  onChange={(e) => setLink({ ...link, url: e.target.value })}
                />
              </label>
              <div>
                <button type="submit">Add to her shelf</button>
              </div>
            </fieldset>
          </form>
        )}
        {config && knittingTiles.length === 0 && (
          <p>Add a Knitting tile in the Tiles tab to save links for her.</p>
        )}
      </section>
    </div>
  )
}
