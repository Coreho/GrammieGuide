import { describe, it, expect } from 'vitest'
import { wmoCodeToCondition, wmoCodeToIcon } from '../../src/main/services/weather/weather'

describe('wmoCodeToCondition', () => {
  it.each([
    [0, 'Clear sky'],
    [2, 'Partly cloudy'],
    [3, 'Overcast'],
    [45, 'Foggy'],
    [55, 'Drizzle'],
    [65, 'Rain'],
    [75, 'Snow'],
    [95, 'Thunderstorm']
  ])('maps WMO code %i to %s', (code, expected) => {
    expect(wmoCodeToCondition(code)).toBe(expected)
  })
})

describe('wmoCodeToIcon', () => {
  it('returns a non-empty icon for every documented WMO code range', () => {
    for (const code of [0, 1, 3, 45, 55, 65, 75, 80, 85, 95]) {
      expect(wmoCodeToIcon(code).length).toBeGreaterThan(0)
    }
  })
})
