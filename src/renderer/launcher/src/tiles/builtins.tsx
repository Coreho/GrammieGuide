import type { ComponentType, ReactNode } from 'react'
import { BUILTIN_TILE_KEYS, type PublicConfig, type Tile } from '@shared/configSchema'
import {
  NewspaperIcon,
  SunCompassIcon,
  PhotoIcon,
  MusicIcon,
  GamesIcon,
  PhoneIcon,
  KnittingIcon
} from '../icons'
import { CallsOverlay } from './CallsOverlay'
import { WeatherOverlay } from '../components/WeatherOverlay'
import { NewsOverlay } from './NewsOverlay'
import { PhotoViewer } from './PhotoViewer'
import { MusicOverlay } from './MusicOverlay'
import { GamesOverlay } from './GamesOverlay'
import { KnittingShelf } from './KnittingShelf'

export type BuiltinKey = (typeof BUILTIN_TILE_KEYS)[number]

export type BuiltinViewProps = {
  tile: Tile
  config: PublicConfig
  onClose: () => void
  /** The view has opened a page in the embedded browser; App switches to it. */
  onBrowsing: () => void
  musicStop?: ReactNode
}

type Builtin = { icon: () => ReactNode; View: ComponentType<BuiltinViewProps> }

function WeatherView({ config, onClose, musicStop }: BuiltinViewProps) {
  return (
    <WeatherOverlay
      locationLabel={config.weather.locations[0]?.label ?? null}
      units={config.weather.units}
      onClose={onClose}
      musicStop={musicStop}
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
  news: { icon: () => <NewspaperIcon />, View: NewsOverlay },
  photos: { icon: () => <PhotoIcon />, View: PhotoViewer },
  music: { icon: () => <MusicIcon />, View: MusicOverlay },
  games: { icon: () => <GamesIcon />, View: GamesOverlay },
  calls: { icon: () => <PhoneIcon color="currentColor" />, View: CallsOverlay },
  knitting: { icon: () => <KnittingIcon />, View: KnittingShelf }
}

export function builtinFor(tile: Tile): Builtin | undefined {
  const key = tile.type === 'builtin' ? tile.builtinKey : undefined
  const registered =
    key && (BUILTIN_TILE_KEYS as readonly string[]).includes(key)
      ? BUILTINS[key as BuiltinKey]
      : undefined
  if (registered) return registered
  return undefined
}
