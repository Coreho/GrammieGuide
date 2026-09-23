import { ipcMain } from 'electron'
import { fetchWeatherForLocation } from '../services/weather/weather'

export function registerWeatherIpc(): void {
  ipcMain.handle('weather:get', (_e, req: { label: string; units: 'imperial' | 'metric' }) =>
    fetchWeatherForLocation(req.label, req.units)
  )
}
