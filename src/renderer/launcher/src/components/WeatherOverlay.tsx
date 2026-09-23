import { useEffect, useState } from 'react'
import { zLayers } from '@shared/zLayers'
import { OverlayShell } from './OverlayShell'
import type { WeatherSnapshot } from '@shared/ipcContract'
import type { LauncherApi } from '../../../../preload/launcher'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}

export function WeatherOverlay({
  locationLabel,
  units,
  onClose
}: {
  locationLabel: string | null
  units: 'imperial' | 'metric'
  onClose: () => void
}) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-location'>('loading')

  useEffect(() => {
    if (!locationLabel) {
      setStatus('no-location')
      return
    }
    window.launcher
      .getWeather(locationLabel, units)
      .then((result) => {
        setSnapshot(result)
        setStatus(result ? 'ready' : 'error')
      })
      .catch(() => setStatus('error'))
  }, [locationLabel, units])

  return (
    <OverlayShell zIndex={zLayers.weatherOverlay} onClose={onClose}>
      {status === 'no-location' && <p>No weather location configured yet.</p>}
      {status === 'loading' && <p>Loading weather...</p>}
      {status === 'error' && <p>Couldn&apos;t load weather right now.</p>}
      {status === 'ready' && snapshot && (
        <div style={{ fontSize: 'calc(1.3rem * var(--font-scale, 1))' }}>
          <div style={{ fontSize: 'calc(3rem * var(--font-scale, 1))' }}>{snapshot.icon}</div>
          <h1>
            {snapshot.temp}°{snapshot.unit} - {snapshot.condition}
          </h1>
          <p>{snapshot.resolvedName}</p>
          <p>
            Feels like {snapshot.feelsLike}° - Humidity {snapshot.humidity}% - Wind {snapshot.windSpeed} mph
          </p>
          {snapshot.high != null && snapshot.low != null && (
            <p>
              High {snapshot.high}° / Low {snapshot.low}°
            </p>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center' }}>
            {snapshot.hourly.map((h, i) => (
              <div key={i}>
                <div>{h.label}</div>
                <div style={{ fontSize: 'calc(1.5rem * var(--font-scale, 1))' }}>{h.icon}</div>
                <div>{h.temp}°</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </OverlayShell>
  )
}
