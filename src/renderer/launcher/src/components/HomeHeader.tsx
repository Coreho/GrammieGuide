import type { WeatherSnapshot } from '@shared/ipcContract'
import type { ReactNode } from 'react'
import { WeatherGlyph } from './WeatherGlyph'
import { CHIP_SHADOW } from '../clay'
import { useLabelFit } from './useLabelFit'

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

export type TimeParts = {
  time: string
  ampm: 'AM' | 'PM'
  period: DayPeriod
  periodLabel: 'Morning' | 'Afternoon' | 'Evening' | 'Night'
  weekday: string
  monthDay: string
  date: string
  orientationLine: string
}

const PERIOD_LABELS: Record<DayPeriod, TimeParts['periodLabel']> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night'
}

/**
 * Home's clock, time-of-day period, and date words, shared with admin's Home
 * preview and ConfusionOverlay.
 *
 * Uses natural dementia-orientation windows:
 * - 5:00 AM - 11:59 AM: morning
 * - 12:00 PM - 4:59 PM: afternoon
 * - 5:00 PM - 8:59 PM: evening
 * - 9:00 PM - 4:59 AM: night (so waking at 2:00 AM says "night", not "morning")
 */
export function timeParts(now: Date): TimeParts {
  const h = now.getHours()
  const m = now.getMinutes()
  const period: DayPeriod =
    h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night'
  const periodLabel = PERIOD_LABELS[period]
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')}`
  const ampm: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM'
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return {
    time,
    ampm,
    period,
    periodLabel,
    weekday,
    monthDay,
    date: `${weekday} ${period}, ${monthDay}`,
    orientationLine: `It is ${weekday} ${period}, ${time} ${ampm} · ${monthDay}`
  }
}

export function inferDayPeriod(dateText: string, ampm: string): DayPeriod {
  const lower = dateText.toLowerCase()
  if (lower.includes('morning')) return 'morning'
  if (lower.includes('afternoon')) return 'afternoon'
  if (lower.includes('evening')) return 'evening'
  if (lower.includes('night')) return 'night'
  return ampm === 'AM' ? 'morning' : 'afternoon'
}

export function DayPeriodGlyph({ period, size = 28 }: { period: DayPeriod; size?: number }) {
  if (period === 'morning') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        style={{ flex: 'none' }}
      >
        <path
          d="M14 5v3M6.5 8.5l2 2M21.5 8.5l-2 2"
          stroke="#E59A10"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path d="M7 18a7 7 0 0 1 14 0" fill="#FFC82C" stroke="#E59A10" strokeWidth={2.2} />
        <path d="M3 19h22M6 23h16" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" />
      </svg>
    )
  }
  if (period === 'afternoon') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        style={{ flex: 'none' }}
      >
        <circle cx="14" cy="14" r="6" fill="#FFC82C" stroke="#E59A10" strokeWidth={2.2} />
        <path
          d="M14 3v3M14 22v3M3 14h3M22 14h3M6.2 6.2l2.1 2.1M19.7 19.7l2.1 2.1M21.8 6.2l-2.1 2.1M8.3 19.7l-2.1 2.1"
          stroke="#E59A10"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (period === 'evening') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        style={{ flex: 'none' }}
      >
        <path d="M7 18a7 7 0 0 1 14 0" fill="#E87A48" stroke="#C65828" strokeWidth={2.2} />
        <path d="M3 19h22M7 23h14" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <path
        d="M18.5 19.5A7.5 7.5 0 0 1 11 6.2a7.5 7.5 0 1 0 9.8 9.8 7.4 7.4 0 0 1-2.3 3.5Z"
        fill="#7857CD"
        fillOpacity={0.28}
        stroke="#7857CD"
        strokeWidth={2.3}
        strokeLinejoin="round"
      />
      <circle cx="20.5" cy="7.5" r="1.5" fill="#FFC82C" />
      <circle cx="23.5" cy="11.5" r="1.2" fill="#FFC82C" />
    </svg>
  )
}

/**
 * Home's clock, weather chip and date row. Its own component so admin's Home
 * preview (TASK-20) renders exactly this, without importing Buddy's Three.js floor.
 */
export function HomeHeader({
  time,
  ampm,
  date,
  period,
  weather,
  nowPlaying
}: {
  time: string
  ampm: string
  date: string
  period?: DayPeriod
  weather: WeatherSnapshot | null
  nowPlaying?: ReactNode
}) {
  const dateRef = useLabelFit<HTMLSpanElement>(date, 'date-row')
  const resolvedPeriod = period ?? inferDayPeriod(date, ampm)
  const resolvedPeriodLabel = PERIOD_LABELS[resolvedPeriod]
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 36
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            minWidth: 0,
            whiteSpace: 'nowrap'
          }}
        >
          <span
            style={{
              fontSize: 'calc(130px * var(--font-scale, 1))',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 0.9,
              color: 'var(--ink,#2E2E2C)',
              textShadow: '0 2px 0 var(--hl,#fff), 0 8px 18px rgba(var(--sh,60,55,45),.12)'
            }}
          >
            {time}
          </span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <span
              style={{
                fontSize: 'calc(40px * var(--font-scale, 1))',
                fontWeight: 700,
                lineHeight: 1,
                color: 'var(--ink2,#5E5D59)'
              }}
            >
              {ampm}
            </span>
            <span
              data-day-period={resolvedPeriod}
              aria-label={`Time of day: ${resolvedPeriodLabel}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
                boxShadow: 'inset 0 2px 1px var(--hl,#fff), 0 4px 10px rgba(var(--sh,60,55,45),.12)',
                fontSize: 'calc(24px * var(--font-scale, 1))',
                fontWeight: 700,
                lineHeight: 1.1,
                color: 'var(--ink,#2E2E2C)'
              }}
            >
              <DayPeriodGlyph period={resolvedPeriod} size={24} />
              <span>{resolvedPeriodLabel}</span>
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '22px 34px 22px 24px',
            borderRadius: 32,
            background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
            boxShadow: CHIP_SHADOW
          }}
        >
          <WeatherGlyph category={weather?.category ?? 'cloudy'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                fontSize: 'calc(56px * var(--font-scale, 1))',
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.02em'
              }}
            >
              {weather ? `${weather.temp}°` : '--°'}
            </div>
            <div
              style={{
                fontSize: 'calc(28px * var(--font-scale, 1))',
                fontWeight: 600,
                color: 'var(--ink2,#4A4945)',
                whiteSpace: 'nowrap'
              }}
            >
              {weather ? weather.condition : 'Set a location in Settings'}
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          fontSize: 'calc(36px * var(--font-scale, 1))',
          fontWeight: 600,
          color: 'var(--ink2,#3E3D3A)',
          lineHeight: 1.2,
          whiteSpace: 'nowrap'
        }}
      >
        <span
          ref={dateRef}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'calc(36px * var(--font-scale, 1) * var(--label-fit, 1))'
          }}
        >
          {date}
        </span>
        {/* TASK-37's now-playing chip can fill this bounded utility area without shrinking or moving the clock. */}
        <div
          data-home-now-playing-slot
          aria-hidden={nowPlaying ? undefined : true}
          style={{ width: 440, flex: 'none' }}
        >
          {nowPlaying}
        </div>
      </div>
    </header>
  )
}
