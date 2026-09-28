import type { ComponentType, ReactNode } from 'react'
import { BUILTIN_TILE_KEYS, type PublicConfig, type Tile } from '@shared/configSchema'
import { NewspaperIcon, SunCompassIcon } from '../icons'
import { WeatherOverlay } from '../components/WeatherOverlay'
import { NewsOverlay } from './NewsOverlay'

export type BuiltinKey = (typeof BUILTIN_TILE_KEYS)[number]

export type BuiltinViewProps = {
  tile: Tile
  config: PublicConfig
  onClose: () => void
  /** The view has opened a page in the embedded browser; App switches to it. */
  onBrowsing: () => void
}

type Builtin = { icon: () => ReactNode; View: ComponentType<BuiltinViewProps> }

function WeatherView({ config, onClose }: BuiltinViewProps) {
  return (
    <WeatherOverlay
      locationLabel={config.weather.locations[0]?.label ?? null}
      units={config.weather.units}
      onClose={onClose}
    />
  )
}

/**
 * What makes each built-in tile its own thing: the picture in its well and the
 * view it opens. A new kind (music, photos, ...) adds its key to
 * BUILTIN_TILE_KEYS and an entry here, not another branch in App.
 */
const BUILTINS: Record<BuiltinKey, Builtin> = {
  weather: { icon: () => <SunCompassIcon />, View: WeatherView },
  news: { icon: () => <NewspaperIcon />, View: NewsOverlay }
}

export function builtinFor(tile: Tile): Builtin | undefined {
  const key = tile.type === 'builtin' ? tile.builtinKey : undefined
  return key && (BUILTIN_TILE_KEYS as readonly string[]).includes(key)
    ? BUILTINS[key as BuiltinKey]
    : undefined
}
