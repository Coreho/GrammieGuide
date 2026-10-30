import { useState } from 'react'
import { httpUrl } from '@shared/news/httpUrl'
import { DEFAULT_NEWS_SOURCES, newsSourceSchema } from '@shared/news/sources'
import { BUILTIN_TILE_KEYS, type Config, type Tile } from '@shared/configSchema'
import type { OldLauncherImportPreview } from '@shared/ipcContract'
import { nextTileColor, TILE_COLOR_INDICES } from '@shared/tileColors'
import { THEMES } from '@shared/theme'
import { TILE_ARTWORK_KEYS, TILE_ARTWORK_LABELS, type TileArtwork } from '@shared/tileArtwork'
import {
  HOME_LAYOUT_NAMES,
  HOME_LAYOUTS,
  availableSlots,
  placeTilesInOrder,
  slotDescription,
  slotsForSize,
  type HomeLayoutName
} from '@shared/homeLayout'
import { useConfigStore } from '../state/useConfigStore'
import { TilePhotoPicker } from './TilePhotoPicker'
import { HomePreview } from './HomePreview'
import { NewsSourcesEditor } from './NewsSourcesEditor'

const ICONS = ['🌐', '🌤️', '📷', '🎵', '🎲', '📰', '📺', '💌', '👪', '🌷', '📚', '💻']
const BUILTIN_LABELS: Record<(typeof BUILTIN_TILE_KEYS)[number], string> = {
  weather: 'Weather',
  news: 'News',
  photos: 'Photos',
  music: 'Music',
  games: 'Games',
  knitting: 'Knitting'
}
type TileDraft = Omit<Tile, 'colorIndex'> & { colorIndex?: number }
const emptyDraft = (): TileDraft => ({
  id: crypto.randomUUID(),
  type: 'web',
  label: '',
  url: '',
  icon: '🌐',
  size: 'normal',
  slot: null
})

/** One draft at a time, so Home changes only when the caregiver saves it. */
export function TilesTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [draft, setDraft] = useState<TileDraft>(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [importPreview, setImportPreview] = useState<OldLauncherImportPreview | null>(null)
  const [importResult, setImportResult] = useState('')

  if (!config) return null

  const colorIndex = draft.colorIndex ?? nextTileColor(config.tiles)
  const palette = THEMES[config.display.theme]
  const layoutName = config.display.homeLayout
  const layout = HOME_LAYOUTS[layoutName]
  const draftAvailableSlots = availableSlots(
    layoutName,
    config.tiles,
    draft.size,
    editing ? draft.id : undefined
  )

  const flashSaved = (): void => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const persist = async (patch: Partial<Config>): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await save(patch)
      flashSaved()
      return true
    } catch {
      setError('Could not save the tiles. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const changeLayout = async (homeLayout: HomeLayoutName): Promise<void> => {
    const ordered = [...config.tiles].sort(
      (a, b) => (a.slot ?? Number.MAX_SAFE_INTEGER) - (b.slot ?? Number.MAX_SAFE_INTEGER)
    )
    const tiles = placeTilesInOrder(homeLayout, ordered)
    if (
      await persist({
        display: { ...config.display, homeLayout },
        tiles
      })
    ) {
      setDraft(emptyDraft())
      setEditing(false)
    }
  }

  const saveTile = async (): Promise<void> => {
    const tile: Tile = { ...draft, colorIndex, label: draft.label.trim(), slot: draft.slot ?? null }
    if (!tile.label) {
      setError('Enter a label.')
      return
    }
    if (tile.label.length > layout.labelMax) {
      setError(
        `${layout.label} labels can be at most ${layout.labelMax} characters so they stay readable at every text size.`
      )
      return
    }
    if (tile.slot === null && !editing) tile.slot = draftAvailableSlots[0] ?? null
    if (tile.slot === null && !editing) {
      setError(
        `There is no ${tile.size === 'wide' ? 'two-space opening' : 'open space'} in ${layout.label}. Remove a tile, choose a larger layout, or change a wide tile to normal.`
      )
      return
    }
    if (tile.slot !== null && !draftAvailableSlots.includes(tile.slot)) {
      setError('That position is not available. Choose another Home position.')
      return
    }
    const isNews = tile.type === 'builtin' && tile.builtinKey === 'news'
    if (isNews && tile.newsSources) {
      const sources = tile.newsSources.map((source) => newsSourceSchema.safeParse(source))
      if (sources.some((result) => !result.success)) {
        setError(
          'Give each news source a name and a complete http:// or https:// website address without a username or password.'
        )
        return
      }
      tile.newsSources = sources.map((result) => result.data!)
      tile.feedUrl = undefined
      tile.url = undefined
    } else if (isNews) {
      const feed = httpUrl(tile.feedUrl)
      if (!feed) {
        setError('Enter a complete http:// or https:// feed address.')
        return
      }
      const site = tile.url?.trim() ? httpUrl(tile.url) : undefined
      if (site === null) {
        setError('Enter a complete http:// or https:// news website address, or leave it blank.')
        return
      }
      tile.feedUrl = feed
      tile.url = site
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
    tile.url = tile.type === 'web' || isNews ? tile.url : undefined
    tile.feedUrl = isNews ? tile.feedUrl : undefined
    tile.newsSources = isNews ? tile.newsSources : undefined
    tile.builtinKey = tile.type === 'builtin' ? (tile.builtinKey ?? 'weather') : undefined
    const tiles = editing
      ? config.tiles.map((t) => (t.id === tile.id ? tile : t))
      : [...config.tiles, tile]
    if (await persist({ tiles })) {
      setDraft(emptyDraft())
      setEditing(false)
    }
  }

  const removeTile = async (id: string): Promise<void> => {
    if (await persist({ tiles: config.tiles.filter((t) => t.id !== id) })) {
      if (draft.id === id) {
        setDraft(emptyDraft())
        setEditing(false)
      }
    }
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
      <HomePreview />

      <section aria-labelledby="home-layout-heading">
        <h3 id="home-layout-heading">Home layout</h3>
        <p style={{ fontSize: '.9rem', color: '#555' }}>
          Positions are permanent. Removing a tile leaves a hole, so her other choices do not move.
          Wide tiles use two neighboring spaces in the same row.
        </p>
        <label>
          Layout{' '}
          <select
            value={layoutName}
            disabled={busy}
            onChange={(event) => void changeLayout(event.target.value as HomeLayoutName)}
          >
            {HOME_LAYOUT_NAMES.map((name) => {
              const choice = HOME_LAYOUTS[name]
              return (
                <option key={name} value={name}>
                  {choice.label} — {choice.capacity} spaces
                </option>
              )
            })}
          </select>
        </label>
        <p>
          <strong>{layout.label}:</strong> {layout.description} Use labels up to {layout.labelMax}{' '}
          characters. A wide tile uses {slotsForSize('wide')} spaces.
        </p>
      </section>

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
        {config.tiles.map((tile) => (
          <li
            key={tile.id}
            style={{ padding: 12, marginBottom: 8, border: '1px solid #ccc', borderRadius: 12 }}
          >
            <strong>
              {tile.icon ?? '🌐'} {tile.label}
            </strong>
            <div style={{ fontSize: '.85rem', margin: '6px 0', overflowWrap: 'anywhere' }}>
              {tile.type} · {tile.size}
              {tile.slot === null
                ? ' · Not shown on Home (overflow)'
                : ` · ${slotDescription(layoutName, tile.slot)}`}
              {tile.url ? ` · ${tile.url}` : ''}
              {tile.feedUrl ? ` · Feed: ${tile.feedUrl}` : ''}
              {tile.newsSources
                ? ` · Sources: ${tile.newsSources.map((source) => source.label).join(', ')}`
                : ''}
              {tile.appPath ? ` · ${tile.appPath}` : ''}
            </div>
            {/* Switching to a denser layout lowers the limit under labels saved earlier. */}
            {tile.label.length > layout.labelMax && (
              <p style={{ fontSize: '.85rem', margin: '0 0 6px', color: '#9a3412' }}>
                This label is {tile.label.length} characters; {layout.label} fits {layout.labelMax}.
                Shorten it so it stays readable at every text size.
              </p>
            )}
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
              maxLength={layout.labelMax}
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
                onChange={(e) => {
                  const builtinKey = e.target.value as keyof typeof BUILTIN_LABELS
                  setDraft({
                    ...draft,
                    builtinKey,
                    // Update stock names, but keep the caregiver's own wording.
                    label:
                      !draft.label || Object.values(BUILTIN_LABELS).includes(draft.label)
                        ? BUILTIN_LABELS[builtinKey]
                        : draft.label,
                    // Each built-in supplies its own line icon on Home.
                    icon: undefined,
                    ...(builtinKey === 'news'
                      ? {
                          size: 'wide' as const,
                          feedUrl: undefined,
                          url: undefined,
                          newsSources: DEFAULT_NEWS_SOURCES.map((source) => ({ ...source }))
                        }
                      : {})
                  })
                }}
              >
                {BUILTIN_TILE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {BUILTIN_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.type === 'builtin' && draft.builtinKey === 'news' && (
            <NewsSourcesEditor draft={{ ...draft, colorIndex }} onChange={setDraft} />
          )}
          <fieldset>
            <legend>Tile color</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TILE_COLOR_INDICES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Palette color ${color + 1}`}
                  aria-pressed={colorIndex === color}
                  onClick={() => setDraft({ ...draft, colorIndex: color })}
                  style={{
                    minWidth: 80,
                    minHeight: 48,
                    borderRadius: 12,
                    background:
                      palette[`tile${color + 1}`] ??
                      `linear-gradient(180deg, ${palette.s1}, ${palette.s2})`,
                    color: palette[`tInk${color + 1}`] ?? palette.tInk ?? palette.ink,
                    outline: colorIndex === color ? '3px solid #267457' : undefined
                  }}
                >
                  Color {color + 1}
                  {colorIndex === color ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <p>Colors follow the Home theme. Some themes use the same shade for every tile.</p>
          </fieldset>
          <label>
            Tile size{' '}
            <select
              value={draft.size}
              onChange={(e) => {
                const size = e.target.value as Tile['size']
                const choices = availableSlots(
                  layoutName,
                  config.tiles,
                  size,
                  editing ? draft.id : undefined
                )
                setDraft({
                  ...draft,
                  size,
                  slot: draft.slot !== null && choices.includes(draft.slot) ? draft.slot : null
                })
              }}
            >
              <option value="normal">Normal</option>
              <option value="wide">Wide (two columns)</option>
            </select>
          </label>
          <label>
            Home position{' '}
            <select
              value={
                draft.slot === null
                  ? editing
                    ? ''
                    : String(draftAvailableSlots[0] ?? '')
                  : String(draft.slot)
              }
              onChange={(event) =>
                setDraft({
                  ...draft,
                  slot: event.target.value === '' ? null : Number(event.target.value)
                })
              }
            >
              {editing && <option value="">Not shown on Home (keep as overflow)</option>}
              {draftAvailableSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slotDescription(layoutName, slot)}
                  {draft.size === 'wide' ? ' (uses two spaces)' : ''}
                </option>
              ))}
            </select>
          </label>
          {draftAvailableSlots.length === 0 && !editing && (
            <p role="alert">
              This layout has no opening for a {draft.size} tile. Choose a larger layout, remove a
              tile, or use a normal-size tile.
            </p>
          )}
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
                onClick={() => setDraft({ ...draft, icon, artwork: undefined })}
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
            Card artwork{' '}
            <select
              aria-label="Card artwork"
              value={draft.artwork ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  artwork: (e.target.value || undefined) as TileArtwork | undefined,
                  // Choosing artwork replaces the custom icon, not the selected photo.
                  icon: e.target.value ? undefined : draft.icon
                })
              }
            >
              <option value="">Automatic / custom icon</option>
              {TILE_ARTWORK_KEYS.map((key) => (
                <option key={key} value={key}>
                  {TILE_ARTWORK_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          {draft.artwork && (
            <p>The photo takes priority. Artwork changes the picture, not what this tile opens.</p>
          )}
          <TilePhotoPicker
            photoId={draft.photoId}
            onChange={(photoId) => setDraft({ ...draft, photoId })}
          />
          <label>
            Custom icon{' '}
            <input
              maxLength={16}
              placeholder="Icon (emoji, optional)"
              value={draft.icon ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  icon: e.target.value,
                  artwork: e.target.value ? undefined : draft.artwork
                })
              }
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
