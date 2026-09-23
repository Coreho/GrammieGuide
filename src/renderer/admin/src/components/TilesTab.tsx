import { useState } from 'react'
import type { Tile } from '@shared/configSchema'
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

  return (
    <div>
      <h2>Home Screen Tiles</h2>
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
