import type { WeatherSnapshot } from '@shared/ipcContract'
import type { ReactNode } from 'react'
import { WeatherGlyph } from './WeatherGlyph'
import { CHIP_SHADOW } from '../clay'
import { useLabelFit } from './useLabelFit'

/** Home's clock and date words, shared with admin's Home preview. */
export function timeParts(now: Date): { time: string; ampm: string; date: string } {
  const h = now.getHours()
  const m = now.getMinutes()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'
  return {
    time: `${h % 12 || 12}:${String(m).padStart(2, '0')}`,
    ampm: h < 12 ? 'AM' : 'PM',
    date: `${now.toLocaleDateString('en-US', { weekday: 'long' })} ${part}, ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
  }
}

/**
 * Home's clock, weather chip and date row. Its own component so admin's Home
 * preview (TASK-20) renders exactly this, without importing Buddy's Three.js floor.
 */
export function HomeHeader({
  time,
  ampm,
  date,
  weather,
  nowPlaying
}: {
  time: string
  ampm: string
  date: string
  weather: WeatherSnapshot | null
  nowPlaying?: ReactNode
}) {
  const dateRef = useLabelFit<HTMLSpanElement>(date, 'date-row')
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 48
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
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
          <span
            style={{
              fontSize: 'calc(44px * var(--font-scale, 1))',
              fontWeight: 700,
              color: 'var(--ink2,#5E5D59)'
            }}
          >
            {ampm}
          </span>
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
