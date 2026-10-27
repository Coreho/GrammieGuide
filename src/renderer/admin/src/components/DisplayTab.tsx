import { useConfigStore } from '../state/useConfigStore'
import {
  BACKGROUNDS,
  THEME_NAMES,
  THEME_LABELS,
  FONT_STEPS,
  backgroundsFor,
  themeTokens,
  type BackgroundName,
  type ThemeName
} from '@shared/theme'
import { HomePreview } from './HomePreview'

export function DisplayTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  if (!config) return null
  const idleDim = config.display.idleDim
  const saveIdleDim = (patch: Partial<typeof idleDim>): void => {
    void save({ display: { ...config.display, idleDim: { ...idleDim, ...patch } } })
  }
  const { theme, background } = config.display
  const offered = backgroundsFor(theme)
  // A background saved under a theme of the other tone stays saved but isn't shown.
  const shown = background && offered.includes(background) ? background : undefined

  return (
    <div>
      <h2>Display</h2>
      <HomePreview />
      <label>
        Theme:{' '}
        <select
          value={config.display.theme}
          onChange={(e) => save({ display: { ...config.display, theme: e.target.value as ThemeName } })}
        >
          {THEME_NAMES.map((name) => (
            <option key={name} value={name}>
              {THEME_LABELS[name]}
            </option>
          ))}
        </select>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: '16px 0' }}>
        <legend>Background</legend>
        <p style={{ fontSize: '.85rem', color: '#666', margin: '4px 0 8px' }}>
          Shown behind Home and her full-screen views. Only colors her text stays easy to read on
          with this theme are offered; cards and tiles keep the theme&apos;s colors.
        </p>
        {background && !shown && (
          <p role="status" style={{ fontSize: '.85rem' }}>
            The saved {BACKGROUNDS[background].label} background doesn&apos;t suit the{' '}
            {THEME_LABELS[theme]} theme, so the theme&apos;s own background is showing. It comes
            back with a {BACKGROUNDS[background].tone} theme, or pick one below.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[undefined, ...offered].map((name: BackgroundName | undefined) => {
            const tokens = themeTokens(theme, name)
            return (
              <label
                key={name ?? 'theme'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  border: '1px solid #ccc',
                  borderRadius: 10
                }}
              >
                <input
                  type="radio"
                  name="background"
                  checked={shown === name}
                  onChange={() => save({ display: { ...config.display, background: name } })}
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,.25)',
                    background: `linear-gradient(180deg, ${tokens.bgA}, ${tokens.bgC})`
                  }}
                />
                {name ? BACKGROUNDS[name].label : 'Theme default'}
              </label>
            )
          })}
        </div>
      </fieldset>
      <label>
        Text size: step {config.display.fontStep + 1} of {FONT_STEPS.length} ({FONT_STEPS[config.display.fontStep]}x)
        <input
          type="range"
          min={0}
          max={FONT_STEPS.length - 1}
          step={1}
          value={config.display.fontStep}
          onChange={(e) => save({ display: { ...config.display, fontStep: Number(e.target.value) } })}
        />
      </label>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        This is the only place to change text size: Home has no text-size buttons, so a stray
        tap can&apos;t change it. Home updates as soon as you move the slider.
      </p>
      <label>
        <input
          type="checkbox"
          checked={config.display.ambientBackground}
          onChange={(e) => save({ display: { ...config.display, ambientBackground: e.target.checked } })}
        />
        Ambient background
      </label>
      <br />
      <label>
        Volume ceiling: {config.display.volumeCeiling}%
        <input
          type="range"
          min={0}
          max={100}
          value={config.display.volumeCeiling}
          onChange={(e) => save({ display: { ...config.display, volumeCeiling: Number(e.target.value) } })}
        />
      </label>
      <h3>Dim the screen when idle</h3>
      <label>
        <input
          type="checkbox"
          checked={idleDim.enabled}
          onChange={(e) => saveIdleDim({ enabled: e.target.checked })}
        />
        Dim Home gently when nobody has used it for a while
      </label>
      <br />
      <label>
        After {idleDim.afterMinutes} minutes without a tap
        <input
          type="range"
          min={2}
          max={60}
          step={1}
          disabled={!idleDim.enabled}
          value={idleDim.afterMinutes}
          onChange={(e) => saveIdleDim({ afterMinutes: Number(e.target.value) })}
        />
      </label>
      <br />
      <label>
        How dim: {Math.round(idleDim.level * 100)}% darker
        <input
          type="range"
          min={0.1}
          max={0.5}
          step={0.05}
          disabled={!idleDim.enabled}
          value={idleDim.level}
          onChange={(e) => saveIdleDim({ level: Number(e.target.value) })}
        />
      </label>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        Her first tap only brightens the screen again; it never opens anything. Home doesn&apos;t
        dim while a web page, Buddy&apos;s chat, his voice or listening, or a photo&apos;s story is
        in use. Music may keep playing, and its Stop button still works while dimmed. Dimming
        never takes her back to Home.
      </p>
    </div>
  )
}
