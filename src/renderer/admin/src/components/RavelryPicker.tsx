import { useEffect, useState, type FormEvent } from 'react'
import type { AdminKnitting } from '@shared/knitting/knitting'
import type { RavelrySearchResult, RavelryStatus } from '@shared/knitting/ravelry'

const rowStyle = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  padding: 10,
  marginBottom: 8,
  border: '1px solid #ccc',
  borderRadius: 12
} as const
const thumbnailStyle = { width: 80, height: 64, objectFit: 'contain', background: '#fff' } as const

function plainMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback
}

/**
 * Picks Ravelry patterns for her. Everything is fetched by main and saved as a plain-text
 * copy with pictures, so Home works offline and never uses the key. The key form only
 * ever sends the key to main, and clears it straight away: nothing can read it back.
 */
export function RavelryPicker({
  picks,
  onChange
}: {
  picks: AdminKnitting['ravelry']
  onChange: (knitting: AdminKnitting) => void
}) {
  const [status, setStatus] = useState<RavelryStatus | null>(null)
  const [username, setUsername] = useState('')
  const [key, setKey] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RavelrySearchResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    window.admin.getRavelryStatus().then(
      (result) => {
        if (live) setStatus(result)
      },
      () => {
        if (live) setError('Could not check the Ravelry key. Try opening this tab again.')
      }
    )
    return () => {
      live = false
    }
  }, [])

  async function run(action: () => Promise<string>, fallback: string): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      setMessage(await action())
    } catch (failure) {
      setError(plainMessage(failure, fallback))
    } finally {
      setBusy(false)
    }
  }

  const saveKey = (): Promise<void> =>
    run(async () => {
      setStatus(await window.admin.saveRavelryKey(username, key))
      setUsername('')
      setKey('')
      return 'The read-only key is saved.'
    }, 'Could not save the key. Try again.')

  const removeKey = (): Promise<void> =>
    run(async () => {
      setStatus(await window.admin.removeRavelryKey())
      setResults(null)
      return 'The key is removed. Her saved patterns stay on her shelf.'
    }, 'Could not remove the key. Try again.')

  const search = (): Promise<void> =>
    run(async () => {
      const found = await window.admin.searchRavelry(query)
      setResults(found)
      return found.length ? '' : 'Nothing found. Try different words.'
    }, 'Could not search Ravelry. Try again.')

  const add = (result: RavelrySearchResult): Promise<void> =>
    run(async () => {
      const { knitting, failedPictures } = await window.admin.addRavelryPattern(result.ravelryId)
      onChange(knitting)
      return failedPictures
        ? `Added, but ${failedPictures} ${failedPictures === 1 ? 'picture' : 'pictures'} could not be saved.`
        : 'Added to her shelf.'
    }, 'Could not add that pattern. Try again.')

  const remove = (id: string): Promise<void> =>
    run(async () => {
      onChange(await window.admin.removeRavelryPattern(id))
      return 'Removed from her shelf.'
    }, 'Could not remove that pattern. Try again.')

  const picked = new Set(picks.map((pick) => pick.ravelryId))

  return (
    <div style={{ marginTop: 20 }}>
      <h4 id="ravelry-picks-heading" style={{ marginBottom: 6 }}>
        Patterns picked for her
      </h4>
      <p style={{ fontSize: '.9rem', color: '#555' }}>
        These show on her shelf as large picture cards with plain words, without Ravelry&apos;s
        website. A copy is saved when you add one, so they still work offline. Ravelry only shares a
        pattern&apos;s pictures and description this way, not its full instructions.
      </p>
      <ul aria-labelledby="ravelry-picks-heading" style={{ listStyle: 'none', padding: 0 }}>
        {picks.map((pick) => (
          <li key={pick.id} style={rowStyle}>
            {pick.thumbnailUrl && <img src={pick.thumbnailUrl} alt="" style={thumbnailStyle} />}
            <span style={{ flex: 1 }}>
              <strong>{pick.name}</strong>
              {pick.designer && ` · ${pick.designer}`}
            </span>
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove Ravelry pattern ${pick.name}`}
              onClick={() => {
                if (window.confirm(`Remove "${pick.name}" from her shelf?`)) void remove(pick.id)
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {picks.length === 0 && <li>No patterns picked yet.</li>}
      </ul>

      {status && !status.connected && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void saveKey()
          }}
        >
          <fieldset
            disabled={busy || !status.canSave}
            style={{ display: 'grid', gap: 14, padding: 20 }}
          >
            <legend>Connect to Ravelry</legend>
            <p style={{ margin: 0, fontSize: '.9rem', color: '#555' }}>
              Sign in at ravelry.com/pro/developer and create an app with{' '}
              <strong>Basic Auth: read only access</strong>, then copy its username and password
              here. A personal key won&apos;t be accepted, because it could change the account.
            </p>
            {!status.canSave && (
              <p role="alert" style={{ margin: 0 }}>
                Windows can&apos;t encrypt the key on this computer, so it can&apos;t be saved.
              </p>
            )}
            <label>
              Username{' '}
              <input
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="read-..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Password{' '}
              <input
                required
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <div>
              <button type="submit">Save key</button>
            </div>
          </fieldset>
        </form>
      )}

      {status?.connected && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void search()
          }}
        >
          <fieldset disabled={busy} style={{ display: 'grid', gap: 14, padding: 20 }}>
            <legend>Find a pattern on Ravelry</legend>
            <label>
              Look for{' '}
              <input
                required
                maxLength={80}
                placeholder="baby blanket"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div>
              <button type="submit">Search</button>
            </div>
          </fieldset>
        </form>
      )}

      {/* Above the results: below twelve of them, it would be off screen from the button pressed. */}
      {busy && <p role="status">Asking Ravelry…</p>}
      {!busy && message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      {status?.connected && (
        <>
          {results && results.length > 0 && (
            <ul
              aria-label="Ravelry results"
              style={{ listStyle: 'none', padding: 0, marginTop: 12 }}
            >
              {results.map((result) => (
                <li key={result.ravelryId} style={rowStyle}>
                  {result.thumbnailUrl && (
                    <img src={result.thumbnailUrl} alt="" style={thumbnailStyle} />
                  )}
                  <span style={{ flex: 1 }}>
                    <strong>{result.name}</strong>
                    {result.designer && ` · ${result.designer}`}
                  </span>
                  <button
                    type="button"
                    disabled={busy || picked.has(result.ravelryId)}
                    aria-label={`Add ${result.name} to her shelf`}
                    onClick={() => void add(result)}
                  >
                    {picked.has(result.ravelryId) ? 'On her shelf' : 'Add to her shelf'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: 12 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Remove the Ravelry key? Her saved patterns stay on her shelf.'))
                  void removeKey()
              }}
            >
              Remove key
            </button>
          </p>
        </>
      )}
    </div>
  )
}
