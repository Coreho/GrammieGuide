import { useConfigStore } from '../state/useConfigStore'
import { THEME_NAMES, THEME_LABELS, FONT_STEPS, type ThemeName } from '@shared/theme'
import { HomePreview } from './HomePreview'

export function DisplayTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  if (!config) return null
  const idleDim = config.display.idleDim
  const saveIdleDim = (patch: Partial<typeof idleDim>): void => {
    void save({ display: { ...config.display, idleDim: { ...idleDim, ...patch } } })
  }

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
