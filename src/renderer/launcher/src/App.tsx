import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Tile as TileType, PublicConfig } from '@shared/configSchema'
import type { WeatherSnapshot } from '@shared/ipcContract'
import { RapidTapTracker } from '@shared/confusionDetector'
import { THEMES, fontScaleForStep, type ThemeName } from '@shared/theme'
import type { LauncherApi } from '../../../preload/launcher'
import { Stage } from './components/Stage'
import { HomeView } from './components/HomeView'
import { NavBar } from './components/NavBar'
import { WeatherOverlay } from './components/WeatherOverlay'
import { ConfusionOverlay } from './components/ConfusionOverlay'
import { Toast } from './components/Toast'
import { BuddyChatPanel } from './buddy/BuddyChatPanel'
import type { ChatPhase } from '@shared/buddy/buddyMachine'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}

type View = 'home' | 'browser'
const WEATHER_REFRESH_MS = 15 * 60 * 1000
const THEME_ONLY_KEYS = ['tile1', 'tile2', 'tile3', 'tile4', 'tInk', 'tInk1', 'tInk2', 'tInk3', 'tInk4', 'wi', 'well']

function timeParts(now: Date): { time: string; ampm: string; date: string } {
  const h = now.getHours()
  const m = now.getMinutes()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'
  return {
    time: `${h % 12 || 12}:${String(m).padStart(2, '0')}`,
    ampm: h < 12 ? 'AM' : 'PM',
    date: `${now.toLocaleDateString('en-US', { weekday: 'long' })} ${part}, ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
  }
}

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [view, setView] = useState<View>('home')
  const [showWeather, setShowWeather] = useState(false)
  const [showConfusion, setShowConfusion] = useState(false)
  const [showBuddyChat, setShowBuddyChat] = useState(false)
  const [buddyChatPhase, setBuddyChatPhase] = useState<ChatPhase>('idle')
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const tapTracker = useRef<RapidTapTracker | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stageRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.launcher.getConfig().then(setConfig)
    return window.launcher.onConfigChanged(setConfig)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!config) return
    const scale = fontScaleForStep(config.display.fontStep)
    document.documentElement.style.setProperty('--font-scale', String(scale))
    tapTracker.current = new RapidTapTracker(config.confusion.rapidTap)
  }, [config])

  useEffect(() => {
    const el = themeRef.current
    if (!config || !el) return
    for (const key of THEME_ONLY_KEYS) el.style.removeProperty(`--${key}`)
    const tokens = THEMES[config.display.theme as ThemeName] ?? THEMES.tilesBold
    for (const [key, value] of Object.entries(tokens)) el.style.setProperty(`--${key}`, value)
  }, [config, config?.display.theme])

  const refreshWeather = useCallback(() => {
    const label = config?.weather.locations[0]?.label
    if (!label) {
      setWeather(null)
      return
    }
    window.launcher.getWeather(label, config?.weather.units ?? 'imperial').then(setWeather)
  }, [config])

  useEffect(() => {
    refreshWeather()
    const t = setInterval(refreshWeather, WEATHER_REFRESH_MS)
    return () => clearInterval(t)
  }, [refreshWeather])

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

  function flashToast(message: string): void {
    clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  async function activateTile(tile: TileType): Promise<void> {
    flashToast(`Opening ${tile.label}...`)
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

  async function handleFontStepChange(next: number): Promise<void> {
    document.documentElement.style.setProperty('--font-scale', String(fontScaleForStep(next)))
    const updated = await window.launcher.setFontStep(next)
    setConfig(updated)
  }

  if (!config) {
    return <div style={{ color: '#fff', padding: 32 }}>Loading...</div>
  }

  const { time, ampm, date } = timeParts(now)

  return (
    <div ref={themeRef} onPointerDown={handlePointerDown} style={{ position: 'fixed', inset: 0 }}>
      <Stage rootRef={stageRef}>
        {view === 'home' && (
          <HomeView
            time={time}
            ampm={ampm}
            date={date}
            weather={weather}
            tiles={config.tiles}
            fontStep={config.display.fontStep}
            onFontStepChange={handleFontStepChange}
            onActivateTile={activateTile}
            onBuddyTap={() => setShowBuddyChat(true)}
            buddy={{
              chatOpen: showBuddyChat,
              chatPhase: buddyChatPhase,
              roaming: config.buddy.roaming,
              chattiness: config.buddy.chattiness,
              hour: now.getHours(),
              weather: weather ? { category: weather.category, temp: weather.temp, unit: weather.unit } : null
            }}
          />
        )}
        {/* Inside the stage, so Buddy (on the footer floor) can stand in front of its backdrop. */}
        {view === 'home' && showBuddyChat && (
          <BuddyChatPanel
            voiceEnabled={config.buddy.voiceEnabled}
            onPhaseChange={setBuddyChatPhase}
            onClose={() => {
              setShowBuddyChat(false)
              setBuddyChatPhase('idle')
            }}
          />
        )}
        {toast && <Toast message={toast} />}
      </Stage>

      {view === 'browser' && <NavBar onHome={goHome} onBack={goBack} />}

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
