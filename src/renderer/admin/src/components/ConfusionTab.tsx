import { useConfigStore } from '../state/useConfigStore'

/**
 * Extends the old app's ConfusionSettings.jsx shape with the new
 * cluster-radius field (rapid-tap detection now requires taps to be
 * spatially clustered, not just frequent - see shared/confusionDetector.ts).
 */
export function ConfusionTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  if (!config) return null
  const { confusion } = config

  return (
    <div>
      <h2>Safety / Confusion Detection</h2>
      <label>
        Inactivity timeout (minutes): {confusion.inactivityTimeoutMinutes}
        <input
          type="range"
          min={1}
          max={60}
          value={confusion.inactivityTimeoutMinutes}
          onChange={(e) => save({ confusion: { ...confusion, inactivityTimeoutMinutes: Number(e.target.value) } })}
        />
      </label>
      <h3>Rapid-tap detection</h3>
      <label>
        Tap count threshold: {confusion.rapidTap.count}
        <input
          type="range"
          min={3}
          max={50}
          value={confusion.rapidTap.count}
          onChange={(e) => save({ confusion: { ...confusion, rapidTap: { ...confusion.rapidTap, count: Number(e.target.value) } } })}
        />
      </label>
      <label>
        Time window (ms): {confusion.rapidTap.windowMs}
        <input
          type="range"
          min={500}
          max={10000}
          step={100}
          value={confusion.rapidTap.windowMs}
          onChange={(e) => save({ confusion: { ...confusion, rapidTap: { ...confusion.rapidTap, windowMs: Number(e.target.value) } } })}
        />
      </label>
      <label>
        Cluster radius (px) - taps must land within this distance of each other:{' '}
        {confusion.rapidTap.clusterRadiusPx}
        <input
          type="range"
          min={20}
          max={400}
          value={confusion.rapidTap.clusterRadiusPx}
          onChange={(e) =>
            save({ confusion: { ...confusion, rapidTap: { ...confusion.rapidTap, clusterRadiusPx: Number(e.target.value) } } })
          }
        />
      </label>
    </div>
  )
}
