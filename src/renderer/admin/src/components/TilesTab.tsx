import { useState } from 'react'
import { BUILTIN_TILE_KEYS, type Tile } from '@shared/configSchema'
import type { OldLauncherImportPreview } from '@shared/ipcContract'
import { useConfigStore } from '../state/useConfigStore'

const ICONS = ['🌐', '🌤️', '📷', '🎵', '🎲', '📰', '📺', '💌', '👪', '🌷', '📚', '💻']
const emptyDraft = (): Tile => ({
  id: crypto.randomUUID(),
  type: 'web',
  label: '',
  url: '',
  icon: '🌐',
  size: 'normal'
})

/** One draft at a time, so Home changes only when the caregiver saves it. */
export function TilesTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [draft, setDraft] = useState<Tile>(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [importPreview, setImportPreview] = useState<OldLauncherImportPreview | null>(null)
  const [importResult, setImportResult] = useState('')

  if (!config) return null

  const flashSaved = (): void => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const persist = async (tiles: Tile[]): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await save({ tiles })
      flashSaved()
      return true
    } catch {
      setError('Could not save the tiles. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveTile = async (): Promise<void> => {
    const tile = { ...draft, label: draft.label.trim() }
    if (!tile.label) {
      setError('Enter a label.')
      return
    }
    if (tile.type === 'web') {
      try {
        const url = new URL(tile.url?.trim() ?? '')
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error()
        tile.url = url.href
      } catch {
        setError('Enter a complete http:// or https:// website address.')
        return
      }
    }
    if (tile.type === 'app' && !/^(?:[a-z]:\\|\\\\)/i.test(tile.appPath?.trim() ?? '')) {
      setError('Enter the full Windows path to an app or shortcut.')
      return
    }
    tile.appPath = tile.type === 'app' ? tile.appPath?.trim() : undefined
    tile.url = tile.type === 'web' ? tile.url : undefined
    tile.builtinKey = tile.type === 'builtin' ? (tile.builtinKey ?? 'weather') : undefined
    const tiles = editing
      ? config.tiles.map((t) => (t.id === tile.id ? tile : t))
      : [...config.tiles, tile]
    if (await persist(tiles)) {
      setDraft(emptyDraft())
      setEditing(false)
    }
  }

  const removeTile = async (id: string): Promise<void> => {
    if (await persist(config.tiles.filter((t) => t.id !== id))) {
      if (draft.id === id) {
        setDraft(emptyDraft())
        setEditing(false)
      }
    }
  }

  const move = async (index: number, direction: number): Promise<void> => {
    const tiles = [...config.tiles]
    const next = index + direction
    if (next < 0 || next >= tiles.length) return
    ;[tiles[index], tiles[next]] = [tiles[next]!, tiles[index]!]
    await persist(tiles)
  }

  const previewImport = async (): Promise<void> => {
    setImportResult('')
    setImportPreview(await window.admin.previewOldLauncherImport())
  }

  const applyImport = async (): Promise<void> => {
    const result = await window.admin.applyOldLauncherImport()
    setImportPreview(null)
    setImportResult(result.ok ? 'Settings imported.' : "Couldn't read the old launcher's settings.")
    // The import saved through main, so pull the fresh config into this panel.
    await useConfigStore.getState().load()
  }

  return (
    <div>
      <h2>Home Screen Tiles</h2>

      <h3>Moving from Grandma&apos;s Launcher?</h3>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        Brings over her settings from the old launcher on this computer: text size, weather
        location, volume limit and timeouts. Tiles aren&apos;t copied; set them up fresh below. The
        old launcher itself is left untouched.
      </p>
      <button onClick={() => void previewImport()}>
        Import settings from Grandma&apos;s Launcher…
      </button>
      {importResult && <p>{importResult}</p>}
      {importPreview && !importPreview.found && (
        <p>The old launcher&apos;s settings weren&apos;t found on this computer.</p>
      )}
      {importPreview?.found && (
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, margin: '8px 0' }}>
          <strong>Will bring over:</strong>
          <ul>
            {importPreview.settings.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {importPreview.settings.length === 0 && (
              <li>Nothing - the old launcher has no settings to carry over.</li>
            )}
          </ul>
          <strong>Won&apos;t bring over:</strong>
          <ul>
            {importPreview.notImported.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button onClick={() => void applyImport()}>Import</button>{' '}
          <button onClick={() => setImportPreview(null)}>Cancel</button>
        </div>
      )}

      {saved && (
        <p role="status" style={{ color: 'green' }}>
          Saved!
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <ol aria-label="Configured tiles" style={{ paddingLeft: 28 }}>
        {config.tiles.map((tile, index) => (
          <li
            key={tile.id}
            style={{ padding: 12, marginBottom: 8, border: '1px solid #ccc', borderRadius: 12 }}
          >
            <strong>
              {tile.icon ?? '🌐'} {tile.label}
            </strong>
            <div style={{ fontSize: '.85rem', margin: '6px 0', overflowWrap: 'anywhere' }}>
              {tile.type} · {tile.size}
              {tile.url ? ` · ${tile.url}` : ''}
              {tile.appPath ? ` · ${tile.appPath}` : ''}
            </div>
            <button
              disabled={busy}
              aria-label={`Edit ${tile.label}`}
              onClick={() => {
                setDraft({ ...tile })
                setEditing(true)
                setError('')
              }}
            >
              Edit
            </button>{' '}
            <button
              disabled={busy || index === 0}
              aria-label={`Move ${tile.label} up`}
              onClick={() => void move(index, -1)}
            >
              ↑ Move up
            </button>{' '}
            <button
              disabled={busy || index === config.tiles.length - 1}
              aria-label={`Move ${tile.label} down`}
              onClick={() => void move(index, 1)}
            >
              ↓ Move down
            </button>{' '}
            <button
              disabled={busy}
              aria-label={`Remove ${tile.label}`}
              onClick={() => void removeTile(tile.id)}
            >
              Remove
            </button>
          </li>
        ))}
        {config.tiles.length === 0 && <li>No tiles yet.</li>}
      </ol>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void saveTile()
        }}
      >
        <fieldset
          disabled={busy}
          style={{ display: 'grid', gap: 14, borderRadius: 12, padding: 20 }}
        >
          <legend>{editing ? 'Edit tile' : 'Add a tile'}</legend>
          <label>
            Tile label{' '}
            <input
              required
              maxLength={80}
              placeholder="Label (e.g. Weather Channel)"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label>
            Tile type{' '}
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft({ ...draft, type: e.target.value as Tile['type'], builtinKey: 'weather' })
              }
            >
              <option value="web">Website</option>
              <option value="app">Installed app</option>
              <option value="builtin">Built-in</option>
            </select>
          </label>
          {draft.type === 'web' && (
            <label>
              Website address{' '}
              <input
                required
                placeholder="https://..."
                value={draft.url ?? ''}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
            </label>
          )}
          {draft.type === 'app' && (
            <label>
              App path{' '}
              <input
                required
                placeholder="C:\\Program Files\\App\\App.exe"
                value={draft.appPath ?? ''}
                onChange={(e) => setDraft({ ...draft, appPath: e.target.value })}
              />
            </label>
          )}
          {draft.type === 'builtin' && (
            <label>
              Built-in feature{' '}
              <select
                value={draft.builtinKey ?? 'weather'}
                onChange={(e) => setDraft({ ...draft, builtinKey: e.target.value })}
              >
                {BUILTIN_TILE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    Weather
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Tile size{' '}
            <select
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: e.target.value as Tile['size'] })}
            >
              <option value="normal">Normal</option>
              <option value="wide">Wide (two columns)</option>
            </select>
          </label>
          <div
            role="group"
            aria-label="Choose an icon"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
          >
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                aria-label={`Icon ${icon}`}
                aria-pressed={draft.icon === icon}
                onClick={() => setDraft({ ...draft, icon })}
                style={{
                  fontSize: 28,
                  minWidth: 48,
                  minHeight: 48,
                  outline: draft.icon === icon ? '3px solid #267457' : undefined
                }}
              >
                {icon}
              </button>
            ))}
          </div>
          <label>
            Custom icon{' '}
            <input
              maxLength={16}
              placeholder="Icon (emoji, optional)"
              value={draft.icon ?? ''}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            />
          </label>
          <div>
            <button type="submit">{editing ? 'Save tile' : 'Add Tile'}</button>{' '}
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyDraft())
                  setEditing(false)
                  setError('')
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </div>
  )
}
