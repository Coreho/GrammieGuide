import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { Tile as TileType, PublicConfig } from '@shared/configSchema'
import type { WeatherSnapshot } from '@shared/ipcContract'
import { RapidTapTracker } from '@shared/confusionDetector'
import { THEMES, fontScaleForStep, type ThemeName } from '@shared/theme'
import type { LauncherApi } from '../../../preload/launcher'
import { Stage } from './components/Stage'
import { HomeView } from './components/HomeView'
import { NavBar } from './components/NavBar'
import { PageRecovery } from './components/PageRecovery'
import type { PageProblem } from '@shared/browser/loadFailure'
import { ConfusionOverlay } from './components/ConfusionOverlay'
import { Toast } from './components/Toast'
import { BuddyChatPanel } from './buddy/BuddyChatPanel'
import type { ChatPhase } from '@shared/buddy/buddyMachine'
import type { BuddyCommand } from '@shared/buddy/commands'
import { BuddyMenu, type BuddyMenuAnchor } from './buddy/BuddyMenu'
import { pickTapReaction, type TapReaction } from '@shared/buddy/tapReactions'
import { builtinFor } from './tiles/builtins'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}

type View = 'home' | 'browser'
const WEATHER_REFRESH_MS = 15 * 60 * 1000
const THEME_ONLY_KEYS = [
  'tile1',
  'tile2',
  'tile3',
  'tile4',
  'tInk',
  'tInk1',
  'tInk2',
  'tInk3',
  'tInk4',
  'wi',
  'well'
]

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
  /** A web page that failed or was blocked; Home's recovery screen stands in for it. */
  const [pageProblem, setPageProblem] = useState<PageProblem | null>(null)
  /** The built-in tile (Weather, News, ...) whose own view is open over Home. */
  const [openBuiltin, setOpenBuiltin] = useState<TileType | null>(null)
  const [showConfusion, setShowConfusion] = useState(false)
  const [showBuddyChat, setShowBuddyChat] = useState(false)
  const [buddyMenuAnchor, setBuddyMenuAnchor] = useState<BuddyMenuAnchor | null>(null)
  const [chatInvitation, setChatInvitation] = useState<'visible' | 'fading' | null>(null)
  const invitationTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearChatInvitation = useCallback(() => {
    invitationTimers.current.forEach(clearTimeout)
    invitationTimers.current = []
    setChatInvitation(null)
  }, [])
  const lastTapReaction = useRef<TapReaction | null>(null)
  const closeBuddyMenu = useCallback(() => setBuddyMenuAnchor(null), [])
  const [buddyCommand, setBuddyCommand] = useState<(BuddyCommand & { sequence: number }) | null>(
    null
  )
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
    const offProblem = window.launcher.onPageProblem(({ kind }) => setPageProblem(kind))
    return () => {
      offIdle()
      offProblem()
    }
  }, [])

  // Whatever went wrong on the last page stays with that page.
  useEffect(() => {
    if (view !== 'browser') setPageProblem(null)
  }, [view])

  const buddyMenuAvailable =
    Boolean(config) && view === 'home' && !openBuiltin && !showConfusion && !showBuddyChat

  useEffect(() => {
    if (!buddyMenuAvailable) closeBuddyMenu()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !event.ctrlKey ||
        !event.shiftKey ||
        event.altKey ||
        event.metaKey ||
        event.key.toLowerCase() !== 'b'
      )
        return
      event.preventDefault()
      if (event.repeat || !buddyMenuAvailable) return
      const stage = stageRef.current
      const hit = stage?.querySelector<HTMLElement>('[data-buddy-tap]')
      if (!stage || !hit) return
      const stageBox = stage.getBoundingClientRect()
      const hitBox = hit.getBoundingClientRect()
      const scale = stageBox.width / stage.offsetWidth
      // The Stage is scaled. Snapshot the moving hit target in Stage coordinates,
      // so the menu opens above him and stays still while the caregiver chooses.
      setBuddyMenuAnchor((previous) =>
        previous
          ? null
          : {
              x: (hitBox.x + hitBox.width / 2 - stageBox.x) / scale,
              y: (hitBox.y - stageBox.y) / scale
            }
      )
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [buddyMenuAvailable, closeBuddyMenu])

  useEffect(() => {
    if (!buddyMenuAvailable || buddyMenuAnchor) clearChatInvitation()
  }, [buddyMenuAvailable, buddyMenuAnchor, clearChatInvitation])

  useEffect(() => {
    const offCommand = window.launcher.onBuddyCommand(clearChatInvitation)
    return () => {
      offCommand()
      invitationTimers.current.forEach(clearTimeout)
    }
  }, [clearChatInvitation])

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    window.launcher.reportActivity()
    // Repeated pats are deliberate interaction, not a sign she is lost.
    if ((e.target as HTMLElement).closest('[data-buddy-tap], [data-buddy-chat-invite]')) return
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
    setBuddyCommand(null)
    clearChatInvitation()
    flashToast(`Opening ${tile.label}...`)
    if (tile.type === 'web' && tile.url) {
      const result = await window.launcher.openBrowser(tile.url)
      if (result.ok) setView('browser')
      return
    }
    if (builtinFor(tile)) {
      setOpenBuiltin(tile)
      return
    }
    if (tile.type === 'app') {
      const result = await window.launcher.openAppTile(tile.id)
      if (!result.ok) flashToast("Let's try something else for now.")
    }
  }

  async function goHome(): Promise<void> {
    await window.launcher.goHome()
    setView('home')
  }

  async function goBack(): Promise<void> {
    await window.launcher.goBack()
  }

  if (!config) {
    return <div style={{ color: '#fff', padding: 32 }}>Loading...</div>
  }

  const { time, ampm, date } = timeParts(now)
  const OpenBuiltinView = openBuiltin ? builtinFor(openBuiltin)?.View : undefined

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
            onActivateTile={activateTile}
            onBuddyTap={() => {
              if (!buddyMenuAvailable || buddyMenuAnchor) return
              clearChatInvitation()
              setChatInvitation('visible')
              // Her invitation outlives a short gesture; another pat starts a fresh eight seconds.
              invitationTimers.current = [
                setTimeout(() => setChatInvitation('fading'), 8_000),
                setTimeout(() => setChatInvitation(null), 8_400)
              ]
              const reaction = pickTapReaction(lastTapReaction.current)
              lastTapReaction.current = reaction
              setBuddyCommand((previous) => ({
                ...reaction,
                speak: config.buddy.voiceEnabled,
                sequence: (previous?.sequence ?? 0) + 1
              }))
            }}
            buddy={{
              chatInvitation: buddyMenuAvailable && !buddyMenuAnchor ? chatInvitation : null,
              onChat: () => {
                clearChatInvitation()
                setShowBuddyChat(true)
              },
              command: buddyCommand,
              chatOpen: showBuddyChat,
              chatPhase: buddyChatPhase,
              roaming: config.buddy.roaming,
              chattiness: config.buddy.chattiness,
              hour: now.getHours(),
              weather: weather
                ? { category: weather.category, temp: weather.temp, unit: weather.unit }
                : null
            }}
          />
        )}
        {buddyMenuAvailable && buddyMenuAnchor && (
          <BuddyMenu
            anchor={buddyMenuAnchor}
            onClose={closeBuddyMenu}
            onChat={() => {
              closeBuddyMenu()
              setShowBuddyChat(true)
            }}
            onCommand={(command) => {
              closeBuddyMenu()
              setBuddyCommand((previous) => ({
                ...command,
                sequence: (previous?.sequence ?? 0) + 1
              }))
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
      {view === 'browser' && pageProblem && (
        <PageRecovery
          problem={pageProblem}
          onAction={() =>
            void (pageProblem === 'blocked'
              ? window.launcher.dismissBlockedPage()
              : window.launcher.retryPage())
          }
          onHome={() => void goHome()}
        />
      )}

      {OpenBuiltinView && openBuiltin && (
        <OpenBuiltinView
          tile={openBuiltin}
          config={config}
          onClose={() => setOpenBuiltin(null)}
          onBrowsing={() => {
            setOpenBuiltin(null)
            setView('browser')
          }}
        />
      )}
      {showConfusion && <ConfusionOverlay onClose={() => setShowConfusion(false)} />}
    </div>
  )
}
