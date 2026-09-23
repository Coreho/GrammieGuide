import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Tile as TileType, PublicConfig } from '@shared/configSchema'
import { RapidTapTracker } from '@shared/confusionDetector'
import type { LauncherApi } from '../../../preload/launcher'
import { HomeView } from './components/HomeView'
import { NavBar } from './components/NavBar'
import { HelpOverlay } from './components/HelpOverlay'
import { WeatherOverlay } from './components/WeatherOverlay'
import { ConfusionOverlay } from './components/ConfusionOverlay'
import { FontScaleControl } from './components/FontScaleControl'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}

type View = 'home' | 'browser'

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [view, setView] = useState<View>('home')
  const [showHelp, setShowHelp] = useState(false)
  const [showWeather, setShowWeather] = useState(false)
  const [showConfusion, setShowConfusion] = useState(false)
  const tapTracker = useRef<RapidTapTracker | null>(null)

  useEffect(() => {
    window.launcher.getConfig().then(setConfig)
  }, [])

  useEffect(() => {
    if (!config) return
    document.documentElement.style.setProperty('--font-scale', String(config.display.fontScale))
    tapTracker.current = new RapidTapTracker(config.confusion.rapidTap)
  }, [config])

  useEffect(() => {
    const offIdle = window.launcher.onIdleTimeout(() => {
      setView('home')
      setShowConfusion(true)
    })
    return offIdle
  }, [])

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    window.launcher.reportActivity()
    const triggered = tapTracker.current?.recordTap(e.clientX, e.clientY) ?? false
    if (triggered) {
      window.launcher.goHome()
      setView('home')
      setShowConfusion(true)
    }
  }, [])

  async function activateTile(tile: TileType): Promise<void> {
    if (tile.type === 'web' && tile.url) {
      const result = await window.launcher.openBrowser(tile.url)
      if (result.ok) setView('browser')
      return
    }
    if (tile.type === 'builtin' && tile.builtinKey === 'weather') {
      setShowWeather(true)
    }
  }

  async function goHome(): Promise<void> {
    await window.launcher.goHome()
    setView('home')
  }

  async function goBack(): Promise<void> {
    await window.launcher.goBack()
  }

  async function handleFontScaleChange(next: number): Promise<void> {
    document.documentElement.style.setProperty('--font-scale', String(next))
    const updated = await window.launcher.setFontScale(next)
    setConfig(updated)
  }

  if (!config) {
    return <div style={{ color: '#fff', padding: 32 }}>Loading...</div>
  }

  return (
    <div onPointerDown={handlePointerDown} style={{ background: '#0f1b2b', minHeight: '100vh' }}>
      {view === 'home' && (
        <>
          <HomeView tiles={config.tiles} onActivate={activateTile} onHelp={() => setShowHelp(true)} />
          <FontScaleControl fontScale={config.display.fontScale} onChange={handleFontScaleChange} />
        </>
      )}
      {view === 'browser' && <NavBar onHome={goHome} onBack={goBack} />}

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {showWeather && (
        <WeatherOverlay
          locationLabel={config.weather.locations[0]?.label ?? null}
          units={config.weather.units}
          onClose={() => setShowWeather(false)}
        />
      )}
      {showConfusion && <ConfusionOverlay onClose={() => setShowConfusion(false)} />}
    </div>
  )
}
