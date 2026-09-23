import { useState } from 'react'
import { useConfigStore } from '../state/useConfigStore'

export function WeatherTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [newLabel, setNewLabel] = useState('')
  if (!config) return null

  const addLocation = async (): Promise<void> => {
    if (!newLabel) return
    await save({
      weather: {
        ...config.weather,
        locations: [...config.weather.locations, { id: crypto.randomUUID(), label: newLabel }]
      }
    })
    setNewLabel('')
  }

  const removeLocation = async (id: string): Promise<void> => {
    await save({ weather: { ...config.weather, locations: config.weather.locations.filter((l) => l.id !== id) } })
  }

  return (
    <div>
      <h2>Weather</h2>
      <label>
        Units:{' '}
        <select
          value={config.weather.units}
          onChange={(e) => save({ weather: { ...config.weather, units: e.target.value as 'imperial' | 'metric' } })}
        >
          <option value="imperial">Fahrenheit</option>
          <option value="metric">Celsius</option>
        </select>
      </label>
      <ul>
        {config.weather.locations.map((loc) => (
          <li key={loc.id}>
            {loc.label} <button onClick={() => removeLocation(loc.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <input placeholder="City name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
      <button onClick={addLocation}>Add Location</button>
    </div>
  )
}
