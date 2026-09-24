import type { Tile as TileType } from '@shared/configSchema'
import type { WeatherSnapshot } from '@shared/ipcContract'
import { TileGrid } from './TileGrid'
import { WeatherGlyph } from './WeatherGlyph'
import { FontScaleControl } from './FontScaleControl'
import { CHIP_SHADOW } from '../clay'
import { BuddyCanvas } from '../buddy/BuddyCanvas'

export function HomeView({
  time,
  ampm,
  date,
  weather,
  tiles,
  fontStep,
  onFontStepChange,
  onActivateTile,
  onBuddyTap
}: {
  time: string
  ampm: string
  date: string
  weather: WeatherSnapshot | null
  tiles: TileType[]
  fontStep: number
  onFontStepChange: (step: number) => void
  onActivateTile: (tile: TileType) => void
  onBuddyTap: () => void
}) {
  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, minWidth: 0, whiteSpace: 'nowrap' }}>
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
            <span style={{ fontSize: 'calc(44px * var(--font-scale, 1))', fontWeight: 700, color: 'var(--ink2,#5E5D59)' }}>
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
              <div style={{ fontSize: 'calc(56px * var(--font-scale, 1))', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {weather ? `${weather.temp}°` : '--°'}
              </div>
              <div style={{ fontSize: 'calc(28px * var(--font-scale, 1))', fontWeight: 600, color: 'var(--ink2,#4A4945)', whiteSpace: 'nowrap' }}>
                {weather ? weather.condition : 'Set a location in Settings'}
              </div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 'calc(36px * var(--font-scale, 1))', fontWeight: 600, color: 'var(--ink2,#3E3D3A)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          {date}
        </div>
      </header>

      <TileGrid tiles={tiles} onActivate={onActivateTile} />

      {/*
        M3: a fixed idle spot, not roaming yet - the tile grid fills the
        rest of the stage edge to edge, so there's no free floor for a
        roaming character until M4 works out avoid-rectangles around the
        grid. This strip is that "M4 will expand this" placeholder.
      */}
      <div style={{ flex: 'none', height: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
        <div style={{ width: 150, height: 150 }}>
          <BuddyCanvas onTap={onBuddyTap} />
        </div>
      </div>

      <footer style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 32 }}>
        <FontScaleControl step={fontStep} onChange={onFontStepChange} />
      </footer>
    </>
  )
}
