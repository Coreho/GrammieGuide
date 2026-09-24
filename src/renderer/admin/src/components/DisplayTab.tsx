import { useConfigStore } from '../state/useConfigStore'
import { THEME_NAMES, THEME_LABELS, FONT_STEPS, type ThemeName } from '@shared/theme'

export function DisplayTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  if (!config) return null

  return (
    <div>
      <h2>Display</h2>
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
      <br />
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
        Grandma can also change this herself from the on-screen A&minus;/A+ control on Home.
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
    </div>
  )
}
