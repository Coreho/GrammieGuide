import { useConfigStore } from '../state/useConfigStore'

export function DisplayTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  if (!config) return null

  return (
    <div>
      <h2>Display</h2>
      <label>
        Font scale: {config.display.fontScale.toFixed(1)}x
        <input
          type="range"
          min={0.8}
          max={1.6}
          step={0.1}
          value={config.display.fontScale}
          onChange={(e) => save({ display: { ...config.display, fontScale: Number(e.target.value) } })}
        />
      </label>
      <br />
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
