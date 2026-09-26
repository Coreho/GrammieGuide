import { useState } from 'react'
import type { Tile } from '@shared/configSchema'
import type { OldLauncherImportPreview } from '@shared/ipcContract'
import { useConfigStore } from '../state/useConfigStore'

/**
 * Ports TileManager.jsx's UX pattern from the old app (add/remove/edit,
 * "Saved!" flash) - that component was called out as solid as-is.
 */
export function TilesTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('')
  const [saved, setSaved] = useState(false)
  const [importPreview, setImportPreview] = useState<OldLauncherImportPreview | null>(null)
  const [importResult, setImportResult] = useState('')

  if (!config) return null

  const flashSaved = (): void => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const addTile = async (): Promise<void> => {
    if (!label || !url) return
    const newTile: Tile = { id: crypto.randomUUID(), type: 'web', label, url, icon: icon || undefined }
    await save({ tiles: [...config.tiles, newTile] })
    setLabel('')
    setUrl('')
    setIcon('')
    flashSaved()
  }

  const removeTile = async (id: string): Promise<void> => {
    await save({ tiles: config.tiles.filter((t) => t.id !== id) })
    flashSaved()
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
        Brings over her settings from the old launcher on this computer: text size, weather location, volume limit and
        timeouts. Tiles aren&apos;t copied; set them up fresh below. The old launcher itself is left untouched.
      </p>
      <button onClick={() => void previewImport()}>Import settings from Grandma&apos;s Launcher…</button>
      {importResult && <p>{importResult}</p>}
      {importPreview && !importPreview.found && <p>The old launcher&apos;s settings weren&apos;t found on this computer.</p>}
      {importPreview?.found && (
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, margin: '8px 0' }}>
          <strong>Will bring over:</strong>
          <ul>
            {importPreview.settings.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {importPreview.settings.length === 0 && <li>Nothing - the old launcher has no settings to carry over.</li>}
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

      {saved && <p style={{ color: 'green' }}>Saved!</p>}
      <ul>
        {config.tiles.map((tile) => (
          <li key={tile.id}>
            {tile.icon ?? '🔷'} {tile.label} ({tile.type}
            {tile.url ? `: ${tile.url}` : ''}){' '}
            <button onClick={() => removeTile(tile.id)}>Remove</button>
          </li>
        ))}
        {config.tiles.length === 0 && <li>No tiles yet.</li>}
      </ul>

      <h3>Add a website tile</h3>
      <input placeholder="Label (e.g. Weather Channel)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
      <input placeholder="Icon (emoji, optional)" value={icon} onChange={(e) => setIcon(e.target.value)} />
      <button onClick={addTile}>Add Tile</button>

      <h3>Built-in tiles</h3>
      <button
        onClick={async () => {
          await save({
            tiles: [...config.tiles, { id: crypto.randomUUID(), type: 'builtin', label: 'Weather', builtinKey: 'weather', icon: '🌤️' }]
          })
          flashSaved()
        }}
      >
        Add Weather tile
      </button>
    </div>
  )
}
