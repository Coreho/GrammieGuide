import { useEffect, useState, type FormEvent } from 'react'
import type { AdminKnitting } from '@shared/knitting/knitting'
import { TilePhotoPicker } from './TilePhotoPicker'

type Draft = { name: string; forWhom: string; photoId?: string }

const toDraft = (knitting: AdminKnitting): Draft => ({
  name: knitting.project?.name ?? '',
  forWhom: knitting.project?.forWhom ?? '',
  photoId: knitting.project?.photoId
})

/**
 * Her project lives in its own main-process file, not in config: Home updates the
 * row count on every tap, and only this tab can set up, reset or remove it.
 */
export function KnittingTab() {
  const [knitting, setKnitting] = useState<AdminKnitting | null>(null)
  const [draft, setDraft] = useState<Draft>({ name: '', forWhom: '' })
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

  async function run(action: () => Promise<AdminKnitting>, done: string): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await action()
      setKnitting(result)
      setDraft(toDraft(result))
      setMessage(done)
    } catch {
      setError('Could not save. Check the details and try again.')
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
          startNew
        }),
      startNew ? 'New project saved. Her row count starts at 0.' : 'Project saved.'
    )
  }

  const project = knitting?.project ?? null

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
    </div>
  )
}
