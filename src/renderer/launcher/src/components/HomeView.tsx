import type { Tile as TileType } from '@shared/configSchema'
import type { WeatherSnapshot } from '@shared/ipcContract'
import { TileGrid } from './TileGrid'
import { BuddyFloor } from '../buddy/BuddyFloor'
import type { ChatPhase, Chattiness, BuddyMotion } from '@shared/buddy/buddyMachine'
import type { RemarkWeather } from '@shared/buddy/remarks'
import type { BuddyCommand } from '@shared/buddy/commands'
import type { HomeLayoutName } from '@shared/homeLayout'
import type { ReactNode } from 'react'
import { HomeHeader } from './HomeHeader'

export type HomeBuddyProps = {
  chatInvitation: 'visible' | 'fading' | null
  onChat: () => void
  command: (BuddyCommand & { sequence: number }) | null
  chatOpen: boolean
  chatPhase: ChatPhase
  motion: BuddyMotion
  chattiness: Chattiness
  hour: number
  weather: RemarkWeather | null
}

export function HomeView({
  time,
  ampm,
  date,
  weather,
  tiles,
  layout,
  onActivateTile,
  onBuddyTap,
  buddy,
  nowPlaying
}: {
  time: string
  ampm: string
  date: string
  weather: WeatherSnapshot | null
  tiles: TileType[]
  layout: HomeLayoutName
  onActivateTile: (tile: TileType) => void
  onBuddyTap: () => void
  buddy: HomeBuddyProps
  nowPlaying?: ReactNode
}) {
  return (
    <>
      <HomeHeader time={time} ampm={ampm} date={date} weather={weather} nowPlaying={nowPlaying} />

      <TileGrid tiles={tiles} layout={layout} onActivate={onActivateTile} />

      <footer
        style={{ flex: 'none', height: 150, display: 'flex', alignItems: 'flex-end', gap: 32 }}
      >
        {/* TASK-22 owns the control; reserving its footprint prevents a later Home reshuffle. */}
        <div
          data-home-contact-slot
          aria-hidden="true"
          style={{ width: 420, height: 112, flex: 'none', pointerEvents: 'none' }}
        />
        {/*
          The floor spans the Stage while the footer reserves exactly 150px.
          No text-size buttons here: the caregiver sets text size in admin's
          Display tab, so a stray tap can't change it on her.
        */}
        <BuddyFloor {...buddy} onTap={onBuddyTap} />
      </footer>
    </>
  )
}
