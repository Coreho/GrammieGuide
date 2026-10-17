import { useState } from 'react'
import {
  BUILTIN_GAME_DESCRIPTIONS,
  BUILTIN_GAME_KEYS,
  BUILTIN_GAME_LABELS,
  installedGameSchema,
  type BuiltinGameKey,
  type InstalledGame
} from '@shared/games/gamesSchema'
import { TILE_COLOR_INDICES } from '@shared/tileColors'
import { THEMES } from '@shared/theme'
import { useConfigStore } from '../state/useConfigStore'

type InstalledDraft = {
  id: string
  label: string
  appPath: string
  colorIndex: number
}

const emptyDraft = (): InstalledDraft => ({
  id: crypto.randomUUID(),
  label: '',
  appPath: '',
  colorIndex: 0
})

export function GamesTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [draft, setDraft] = useState<InstalledDraft>(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  if (!config) return null

  const palette = THEMES[config.display.theme]
  const games = config.games

  const flashSaved = (): void => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const persistGames = async (nextGames: typeof games): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await save({ games: nextGames })
      flashSaved()
      return true
    } catch {
      setError('Could not save game settings. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const toggleBuiltin = async (key: BuiltinGameKey): Promise<void> => {
    const enabled = games.enabledBuiltins.includes(key)
      ? games.enabledBuiltins.filter((k) => k !== key)
      : [...games.enabledBuiltins, key]
    await persistGames({ ...games, enabledBuiltins: enabled })
  }

  const toggleFamilyPhotos = async (useFamilyPhotos: boolean): Promise<void> => {
    await persistGames({ ...games, useFamilyPhotos })
  }

  const saveInstalledGame = async (): Promise<void> => {
    const parsed = installedGameSchema.safeParse({
      id: draft.id,
      label: draft.label.trim(),
      appPath: draft.appPath.trim(),
      colorIndex: draft.colorIndex
    })
    if (!parsed.success) {
      if (!draft.label.trim()) {
        setError('Enter a game name (up to 28 characters).')
      } else if (draft.label.trim().length > 28) {
        setError('Game names can be at most 28 characters so they stay readable at every text size.')
      } else {
        setError('Enter the full Windows path to a game or shortcut (for example C:\\Games\\Solitaire.exe).')
      }
      return
    }
    const entry: InstalledGame = parsed.data
    if (!editing && games.installedGames.length >= 12) {
      setError('Up to 12 installed games can be listed in the Games hub.')
      return
    }
    const installedGames = editing
      ? games.installedGames.map((g) => (g.id === entry.id ? entry : g))
      : [...games.installedGames, entry]
    if (await persistGames({ ...games, installedGames })) {
      setDraft(emptyDraft())
      setEditing(false)
    }
  }

  const removeInstalledGame = async (id: string): Promise<void> => {
    const installedGames = games.installedGames.filter((g) => g.id !== id)
    if (await persistGames({ ...games, installedGames })) {
      if (draft.id === id) {
        setDraft(emptyDraft())
        setEditing(false)
      }
    }
  }

  return (
    <div>
      <h2>Games</h2>
      <p style={{ fontSize: '.9rem', color: '#555' }}>
        Add a <strong>Built-in → Games</strong> tile in the Tiles tab to show the Games hub on Home.
        Choose which built-in games appear and optionally add games installed on this computer.
      </p>

      {saved && (
        <p role="status" style={{ color: 'green' }}>
          Saved!
        </p>
      )}
      {error && <p role="alert">{error}</p>}

      <section aria-labelledby="builtin-games-heading" style={{ marginBottom: 24 }}>
        <h3 id="builtin-games-heading">Built-in calm games</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {BUILTIN_GAME_KEYS.map((key) => {
            const checked = games.enabledBuiltins.includes(key)
            return (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 12,
                  border: '1px solid #ccc',
                  borderRadius: 10
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => void toggleBuiltin(key)}
                />
                <span>
                  <strong>{BUILTIN_GAME_LABELS[key]}</strong>
                  <br />
                  <span style={{ fontSize: '.85rem', color: '#555' }}>
                    {BUILTIN_GAME_DESCRIPTIONS[key]}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="games-photos-heading" style={{ marginBottom: 24 }}>
        <h3 id="games-photos-heading">Family photos in games</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={games.useFamilyPhotos}
            disabled={busy}
            onChange={(e) => void toggleFamilyPhotos(e.target.checked)}
          />
          <span>
            Use her approved family photos in Matching Pairs and Picture Puzzle when available
          </span>
        </label>
      </section>

      <section aria-labelledby="installed-games-heading">
        <h3 id="installed-games-heading">Installed games on this computer</h3>
        <p style={{ fontSize: '.85rem', color: '#555' }}>
          Games added here appear as cards inside the Games hub without taking up extra spaces on
          Home.
        </p>
        <ol aria-label="Configured installed games" style={{ paddingLeft: 28 }}>
          {games.installedGames.map((item) => (
            <li
              key={item.id}
              style={{ padding: 12, marginBottom: 8, border: '1px solid #ccc', borderRadius: 12 }}
            >
              <strong>{item.label}</strong>
              <div style={{ fontSize: '.85rem', margin: '6px 0', overflowWrap: 'anywhere' }}>
                {item.appPath}
              </div>
              <button
                disabled={busy}
                aria-label={`Edit ${item.label}`}
                onClick={() => {
                  setDraft({ ...item })
                  setEditing(true)
                  setError('')
                }}
              >
                Edit
              </button>{' '}
              <button
                disabled={busy}
                aria-label={`Remove ${item.label}`}
                onClick={() => void removeInstalledGame(item.id)}
              >
                Remove
              </button>
            </li>
          ))}
          {games.installedGames.length === 0 && <li>No installed games added yet.</li>}
        </ol>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void saveInstalledGame()
          }}
        >
          <fieldset
            disabled={busy}
            style={{ display: 'grid', gap: 14, borderRadius: 12, padding: 20 }}
          >
            <legend>{editing ? 'Edit installed game' : 'Add an installed game'}</legend>
            <label>
              Game label{' '}
              <input
                required
                maxLength={28}
                placeholder="Label (e.g. Solitaire)"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <label>
              Windows path{' '}
              <input
                required
                placeholder="C:\\Program Files\\Games\\Solitaire.exe"
                value={draft.appPath}
                onChange={(e) => setDraft({ ...draft, appPath: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Card color</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TILE_COLOR_INDICES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Game card color ${color + 1}`}
                    aria-pressed={draft.colorIndex === color}
                    onClick={() => setDraft({ ...draft, colorIndex: color })}
                    style={{
                      minWidth: 80,
                      minHeight: 44,
                      borderRadius: 12,
                      background:
                        palette[`tile${color + 1}`] ??
                        `linear-gradient(180deg, ${palette.s1}, ${palette.s2})`,
                      color: palette[`tInk${color + 1}`] ?? palette.tInk ?? palette.ink,
                      outline: draft.colorIndex === color ? '3px solid #267457' : undefined
                    }}
                  >
                    Color {color + 1}
                    {draft.colorIndex === color ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <button type="submit">
                {editing ? 'Save installed game' : 'Add installed game'}
              </button>{' '}
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
      </section>
    </div>
  )
}
