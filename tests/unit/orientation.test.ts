import { describe, expect, it } from 'vitest'
import { inferDayPeriod, timeParts } from '../../src/renderer/launcher/src/components/HomeHeader'

describe('timeParts dementia-friendly orientation', () => {
  it('classifies morning (5 AM - 11:59 AM), afternoon (12 PM - 4:59 PM), evening (5 PM - 8:59 PM), and night (9 PM - 4:59 AM)', () => {
    const morning = timeParts(new Date(2026, 9, 17, 9, 5))
    expect(morning.time).toBe('9:05')
    expect(morning.ampm).toBe('AM')
    expect(morning.period).toBe('morning')
    expect(morning.periodLabel).toBe('Morning')
    expect(morning.date).toBe('Saturday morning, October 17')
    expect(morning.orientationLine).toBe('It is Saturday morning, 9:05 AM · October 17')

    const afternoon = timeParts(new Date(2026, 9, 17, 14, 30))
    expect(afternoon.time).toBe('2:30')
    expect(afternoon.ampm).toBe('PM')
    expect(afternoon.period).toBe('afternoon')
    expect(afternoon.periodLabel).toBe('Afternoon')

    const evening = timeParts(new Date(2026, 9, 17, 18, 15))
    expect(evening.time).toBe('6:15')
    expect(evening.ampm).toBe('PM')
    expect(evening.period).toBe('evening')
    expect(evening.periodLabel).toBe('Evening')

    const lateNight = timeParts(new Date(2026, 9, 17, 22, 45))
    expect(lateNight.time).toBe('10:45')
    expect(lateNight.ampm).toBe('PM')
    expect(lateNight.period).toBe('night')
    expect(lateNight.periodLabel).toBe('Night')

    // 2:10 AM is still night, never misleadingly labeled "morning"
    const earlyHours = timeParts(new Date(2026, 9, 17, 2, 10))
    expect(earlyHours.time).toBe('2:10')
    expect(earlyHours.ampm).toBe('AM')
    expect(earlyHours.period).toBe('night')
    expect(earlyHours.periodLabel).toBe('Night')
    expect(earlyHours.date).toBe('Saturday night, October 17')
  })

  it('infers day period from date text when period prop is omitted', () => {
    expect(inferDayPeriod('Wednesday morning, October 14', 'AM')).toBe('morning')
    expect(inferDayPeriod('Wednesday afternoon, October 14', 'PM')).toBe('afternoon')
    expect(inferDayPeriod('Wednesday evening, October 14', 'PM')).toBe('evening')
    expect(inferDayPeriod('Wednesday night, October 14', 'AM')).toBe('night')
  })
})
