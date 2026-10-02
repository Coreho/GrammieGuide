import type { ComponentType, ReactNode } from 'react'
import { BUILTIN_TILE_KEYS, type PublicConfig, type Tile } from '@shared/configSchema'
import { LinkIcon, NewspaperIcon, SunCompassIcon } from '../icons'
import { WeatherOverlay } from '../components/WeatherOverlay'
import { NewsOverlay } from './NewsOverlay'
import { OverlayShell } from '../components/OverlayShell'
import { zLayers } from '@shared/zLayers'

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

function MediaNotSetup({ tile, onClose }: BuiltinViewProps) {
  return (
    <OverlayShell zIndex={zLayers.weatherOverlay} onClose={onClose}>
      <section role="dialog" aria-label={tile.label}>
        <p style={{ fontSize: 'calc(32px * var(--font-scale, 1))' }}>
          {tile.label} is not set up yet.
        </p>
        <button
          onClick={onClose}
          style={{ padding: '18px 32px', fontSize: 'calc(28px * var(--font-scale, 1))' }}
        >
          Back to Home
        </button>
      </section>
    </OverlayShell>
  )
}

const MEDIA_NOT_SETUP: Builtin = { icon: () => <LinkIcon />, View: MediaNotSetup }

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
  const registered =
    key && (BUILTIN_TILE_KEYS as readonly string[]).includes(key)
      ? BUILTINS[key as BuiltinKey]
      : undefined
  if (registered) return registered
  // A backup can retain media tiles from another setup. Until the media views
  // are registered, keep a calm route back Home instead of a tile that does nothing.
  if (key === 'photos' || key === 'music') return MEDIA_NOT_SETUP
  return undefined
}
