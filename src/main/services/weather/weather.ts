import type { WeatherSnapshot, WeatherHourEntry } from '@shared/ipcContract'

/**
 * Ported near-verbatim from grandmas-launcher's src/main/weather.js (Open-Meteo,
 * no API key, per-location caching) - that file was called out in research as
 * clean and portable as-is. Geocodes a free-text place name (same UX as the
 * old app's caregiver-facing "location" field) and caches the result in
 * memory for CACHE_TTL_MS.
 */

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

type CacheEntry = { data: WeatherSnapshot; at: number }
const cache = new Map<string, CacheEntry>()

export function clearWeatherCache(): void {
  cache.clear()
}

export async function fetchWeatherForLocation(
  locationLabel: string,
  units: 'imperial' | 'metric'
): Promise<WeatherSnapshot | null> {
  if (!locationLabel) return null

  const cacheKey = `${locationLabel}:${units}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationLabel)}&count=1`
    )
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string }>
    }
    const match = geoData.results?.[0]
    if (!match) return cached?.data ?? null

    const { latitude, longitude, name } = match
    const unit: 'F' | 'C' = units === 'imperial' ? 'F' : 'C'
    const tempUnit = unit === 'F' ? 'fahrenheit' : 'celsius'
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,weathercode,windspeed_10m,apparent_temperature,relativehumidity_2m` +
        `&temperature_unit=${tempUnit}&windspeed_unit=mph` +
        `&daily=sunset,temperature_2m_max,temperature_2m_min` +
        `&hourly=temperature_2m,weathercode&forecast_hours=12&timezone=auto`
    )
    const weatherData = (await weatherRes.json()) as {
      current: {
        time: string
        temperature_2m: number
        weathercode: number
        windspeed_10m: number
        apparent_temperature: number
        relativehumidity_2m: number
      }
      daily?: { sunset?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[] }
      hourly?: { time?: string[]; temperature_2m?: number[]; weathercode?: number[] }
    }

    const current = weatherData.current
    const daily = weatherData.daily ?? {}
    const hourly = weatherData.hourly ?? {}

    const hourlyTimes = hourly.time ?? []
    const nowIdx = Math.max(0, hourlyTimes.findIndex((t) => t >= current.time))
    const nextHours: WeatherHourEntry[] = hourlyTimes.slice(nowIdx, nowIdx + 6).map((t, i) => {
      const hi = nowIdx + i
      const rawHour = parseInt(t.split('T')[1] ?? '0', 10)
      const ampm = rawHour >= 12 ? 'pm' : 'am'
      const displayHour = rawHour === 0 ? 12 : rawHour > 12 ? rawHour - 12 : rawHour
      return {
        label: i === 0 ? 'Now' : `${displayHour}${ampm}`,
        temp: Math.round((hourly.temperature_2m ?? [])[hi] ?? 0),
        icon: wmoCodeToIcon((hourly.weathercode ?? [])[hi] ?? 0)
      }
    })

    const result: WeatherSnapshot = {
      locationLabel,
      resolvedName: name,
      temp: Math.round(current.temperature_2m),
      unit,
      condition: wmoCodeToCondition(current.weathercode),
      icon: wmoCodeToIcon(current.weathercode),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relativehumidity_2m),
      windSpeed: Math.round(current.windspeed_10m),
      high: daily.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null,
      low: daily.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null,
      hourly: nextHours
    }

    cache.set(cacheKey, { data: result, at: Date.now() })
    return result
  } catch (err) {
    console.error('Weather fetch failed:', err)
    return cached?.data ?? null
  }
}

export function wmoCodeToCondition(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 49) return 'Foggy'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  if (code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

export function wmoCodeToIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 49) return '🌫️'
  if (code <= 69) return '🌧️'
  if (code <= 79) return '🌨️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '❄️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}
