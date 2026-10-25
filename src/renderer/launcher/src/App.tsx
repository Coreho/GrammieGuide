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
import { THEMES, THEME_ONLY_KEYS, fontScaleForStep, type ThemeName } from '@shared/theme'
import type { LauncherApi } from '../../../preload/launcher'
import { Stage } from './components/Stage'
import { HomeView } from './components/HomeView'
import { timeParts } from './components/HomeHeader'
import { NavBar } from './components/NavBar'
import { VideoControls } from './components/VideoControls'
import { ReaderView } from './components/ReaderView'
import { EMPTY_READER } from '@shared/news/reader'
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
import { useMusicPlayer } from './music/useMusicPlayer'
import { NowPlayingChip } from './music/NowPlayingChip'
import { zLayers } from '@shared/zLayers'
import { ACTION_REPLIES, type BuddyActionPlan } from '@shared/buddy/actions'
import { openBuddyTile } from './buddy/openBuddyTile'
import { IdleDimOverlay } from './components/IdleDimOverlay'
import { useAudioHold, useIdleDim } from './components/useIdleDim'
import { useContactFlow } from './contacts/useContactFlow'
import { ContactButton } from './contacts/ContactButton'
import { ContactOverlay } from './contacts/ContactOverlay'
import { tilesInHome } from '@shared/homeLayout'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}

type View = 'home' | 'browser'
const WEATHER_REFRESH_MS = 15 * 60 * 1000

export default function App() {
  const { player: music, state: musicState } = useMusicPlayer()
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const contactFlow = useContactFlow(config?.contacts)
  const configRef = useRef(config)
  configRef.current = config
  const [view, setView] = useState<View>('home')
  const [reader, setReader] = useState(EMPTY_READER)
  useEffect(() => window.launcher.onReader(setReader), [])
  /** A web page that failed or was blocked; Home's recovery screen stands in for it. */
  const [pageProblem, setPageProblem] = useState<PageProblem | null>(null)
  /** The built-in tile (Weather, News, ...) whose own view is open over Home. */
  const [openBuiltin, setOpenBuiltin] = useState<TileType | null>(null)
  const presentedCall = useRef<string | null>(null)
  const callsEnabled =
    !!config &&
    tilesInHome(config.display.homeLayout, config.tiles).some(
      (tile) => tile.type === 'builtin' && tile.builtinKey === 'calls'
    )
  useEffect(() => {
    if (callsEnabled) void window.launcher.prepareWhatsApp().catch(() => {})
    // Removing the calling tile must release any hidden microphone/backend.
    else if (configRef.current) void window.launcher.closeWhatsAppCalls().catch(() => {})
  }, [callsEnabled])
  useEffect(
    () =>
      window.launcher.onWhatsAppChanged((state) => {
        // Present each local call once. Late status events during hang-up must
        // not reopen a dialog she has just closed with End call and go Home.
        if (!state.call || presentedCall.current === state.call.id) return
        presentedCall.current = state.call.id
        setShowBuddyChat(false)
        setShowConfusion(false)
        setBuddyMenuAnchor(null)
        void window.launcher.goHome().catch(() => {})
        setView('home')
        setOpenBuiltin((current) =>
          current?.builtinKey === 'calls'
            ? current
            : {
                id: 'active-family-call',
                type: 'builtin',
                builtinKey: 'calls',
                label: 'Family calls',
                colorIndex: 0,
                size: 'normal',
                slot: null
              }
        )
      }),
    []
  )
  useEffect(
    () =>
      window.launcher.onNewsShelf(({ tileId }) => {
        const tile = configRef.current?.tiles.find((candidate) => candidate.id === tileId)
        if (tile?.type === 'builtin' && tile.builtinKey === 'news') {
          setOpenBuiltin(tile)
        }
        setView('home')
      }),
    []
  )
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
  // Read from an IPC listener registered once, so it must not be a stale closure.
  const recoveryCheckAllowed = useRef(false)

  useEffect(() => {
    window.launcher.getConfig().then(setConfig)
    return window.launcher.onConfigChanged(setConfig)
  }, [])

  useEffect(() => {
    if (config?.buddy.chatEnabled === false) {
      setShowBuddyChat(false)
      setBuddyChatPhase('idle')
      clearChatInvitation()
    }
  }, [config?.buddy.chatEnabled, clearChatInvitation])

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

  const triggerConfusionRecovery = useCallback(() => {
    clearTimeout(toastTimer.current)
    setToast(null)
    window.launcher.goHome()
    setView('home')
    setOpenBuiltin(null)
    setShowBuddyChat(false)
    setBuddyChatPhase('idle')
    clearChatInvitation()
    closeBuddyMenu()
    setShowConfusion(true)
    setBuddyCommand((previous) => ({
      clip: 'wave',
      text: 'Take your time — everything is right here on Home.',
      speak: Boolean(configRef.current?.buddy.voiceEnabled),
      sequence: (previous?.sequence ?? 0) + 1
    }))
  }, [clearChatInvitation, closeBuddyMenu])

  useEffect(() => {
    const offIdle = window.launcher.onIdleTimeout(() => {
      triggerConfusionRecovery()
    })
    const offProblem = window.launcher.onPageProblem(({ kind }) => setPageProblem(kind))
    // The caregiver's recovery check opens its page the way a tile does, but
    // only from plain Home: it must never cover something she is using.
    const offCheck = window.launcher.onRecoveryCheck(() => {
      if (!recoveryCheckAllowed.current) return
      void window.launcher.openRecoveryCheck().then((result) => {
        if (result.ok) setView('browser')
      })
    })
    const offReturn = window.launcher.onReturnHome(() => setView('home'))
    return () => {
      offIdle()
      offProblem()
      offCheck()
      offReturn()
    }
  }, [triggerConfusionRecovery])

  // Whatever went wrong on the last page stays with that page.
  useEffect(() => {
    if (view !== 'browser') setPageProblem(null)
  }, [view])

  const buddyMenuAvailable =
    Boolean(config) &&
    view === 'home' &&
    !openBuiltin &&
    !showConfusion &&
    !showBuddyChat &&
    !contactFlow.open
  recoveryCheckAllowed.current = buddyMenuAvailable && !buddyMenuAnchor

  const audioHold = useAudioHold()
  const idleDimmed = useIdleDim(config?.display.idleDim, {
    embeddedWebOpen: view === 'browser',
    buddyChatOpen: showBuddyChat,
    audioHold,
    contactFlow: contactFlow.open
  })

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
    if (
      !buddyMenuAvailable ||
      buddyMenuAnchor ||
      !config?.buddy.chatEnabled ||
      config.buddy.tapAction === 'chat'
    )
      clearChatInvitation()
  }, [
    buddyMenuAvailable,
    buddyMenuAnchor,
    config?.buddy.chatEnabled,
    config?.buddy.tapAction,
    clearChatInvitation
  ])

  useEffect(() => {
    const offCommand = window.launcher.onBuddyCommand(clearChatInvitation)
    return () => {
      offCommand()
      invitationTimers.current.forEach(clearTimeout)
    }
  }, [clearChatInvitation])

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      window.launcher.reportActivity()
      // Repeated pats and game taps are deliberate interaction, not a sign she is lost.
      if (
        (e.target as HTMLElement).closest(
          '[data-buddy-tap], [data-buddy-chat-invite], [data-game-interactive], [data-contact-control]'
        )
      )
        return
      const triggered = tapTracker.current?.recordTap(e.clientX, e.clientY) ?? false
      if (triggered) {
        triggerConfusionRecovery()
      }
    },
    [triggerConfusionRecovery]
  )

  function flashToast(message: string): void {
    clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  /**
   * A tap and Buddy open tiles the same way. Buddy also needs to know whether
   * it worked before saying so: true opened, false failed, null not known yet
   * (a slow page), which Buddy must not call either.
   */
  async function activateTile(tile: TileType, viaBuddy = false): Promise<boolean | null> {
    setBuddyCommand(null)
    clearChatInvitation()
    // Buddy's reply comes after the open; a tap gets this at once.
    if (!viaBuddy) {
      if (tile.type === 'builtin' && tile.builtinKey === 'news' && tile.newsSources) {
        clearTimeout(toastTimer.current)
        setToast(null)
      } else flashToast(`Opening ${tile.label}...`)
    }
    if (tile.type === 'web' && tile.url) {
      if (!viaBuddy) {
        const result = await window.launcher.openBrowser(tile.url)
        if (result.ok) setView('browser')
        return result.ok
      }
      setView('browser')
      // By saved ID only; a failed load keeps Home's recovery screen, as after a tap.
      const outcome = await window.launcher.openBrowserTile(tile.id)
      if (outcome === 'refused') await goHome()
      return outcome === 'loaded' ? true : outcome === 'pending' ? null : false
    }
    if (builtinFor(tile)) {
      setOpenBuiltin(tile)
      return true
    }
    if (tile.type === 'app') {
      const result = await window.launcher.openAppTile(tile.id)
      if (!result.ok && !viaBuddy) flashToast("Let's try something else for now.")
      return result.ok
    }
    return false
  }

  async function goHome(): Promise<void> {
    await window.launcher.goHome()
    setView('home')
  }

  async function goBack(): Promise<void> {
    await window.launcher.goBack()
  }

  async function runBuddyAction(plan: BuddyActionPlan): Promise<void> {
    clearTimeout(toastTimer.current)
    setToast(null)
    await window.launcher.goHome()
    setView('home')
    setOpenBuiltin(null)
    setShowConfusion(false)
    setShowBuddyChat(false)
    setBuddyChatPhase('idle')
    clearChatInvitation()
    if (plan.action === 'openTile') {
      const reply = await openBuddyTile(
        plan.tileId,
        config,
        () => configRef.current,
        window.launcher.buddyAction,
        (tile) => activateTile(tile, true)
      )
      if (reply) flashToast(reply)
    } else if (plan.action === 'playMusic') {
      const started = await music.playAndConfirm(plan.playlistId)
      flashToast(started ? ACTION_REPLIES.musicPlaying : ACTION_REPLIES.musicFailed)
    } else if (plan.action === 'showPhotos') {
      setOpenBuiltin(
        config?.tiles.find((tile) => tile.type === 'builtin' && tile.builtinKey === 'photos') ?? {
          id: 'buddy-photos',
          type: 'builtin',
          builtinKey: 'photos',
          label: 'Pictures',
          size: 'normal',
          slot: null,
          colorIndex: 1
        }
      )
      flashToast(ACTION_REPLIES.photosOpening)
    } else flashToast(ACTION_REPLIES.home)
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
            layout={config.display.homeLayout}
            nowPlaying={<NowPlayingChip state={musicState} onStop={() => music.stop()} />}
            contact={
              config.contacts.enabled && config.contacts.preferred ? (
                <ContactButton
                  name={contactFlow.state?.contact?.name ?? config.contacts.preferred.name}
                  photoUrl={contactFlow.state?.contact?.photoUrl}
                  onClick={() => {
                    clearChatInvitation()
                    closeBuddyMenu()
                    setBuddyCommand(null)
                    contactFlow.request()
                  }}
                />
              ) : undefined
            }
            onActivateTile={activateTile}
            onBuddyTap={() => {
              if (!buddyMenuAvailable || buddyMenuAnchor) return
              clearChatInvitation()
              if (config.buddy.chatEnabled && config.buddy.tapAction === 'chat') {
                setShowBuddyChat(true)
                return
              }
              if (config.buddy.chatEnabled) {
                setChatInvitation('visible')
                // Her invitation outlives a short gesture; another pat starts a fresh eight seconds.
                invitationTimers.current = [
                  setTimeout(() => setChatInvitation('fading'), 8_000),
                  setTimeout(() => setChatInvitation(null), 8_400)
                ]
              }
              const reaction = pickTapReaction(
                lastTapReaction.current,
                Math.random,
                config.buddy.motion
              )
              lastTapReaction.current = reaction
              setBuddyCommand((previous) => ({
                ...reaction,
                speak: config.buddy.voiceEnabled,
                sequence: (previous?.sequence ?? 0) + 1
              }))
            }}
            buddy={{
              chatInvitation:
                config.buddy.chatEnabled && buddyMenuAvailable && !buddyMenuAnchor
                  ? chatInvitation
                  : null,
              onChat: () => {
                clearChatInvitation()
                if (config.buddy.chatEnabled) setShowBuddyChat(true)
              },
              command: buddyCommand,
              chatOpen: config.buddy.chatEnabled && showBuddyChat,
              chatPhase: buddyChatPhase,
              motion: config.buddy.motion,
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
            onChat={
              config.buddy.chatEnabled
                ? () => {
                    closeBuddyMenu()
                    setShowBuddyChat(true)
                  }
                : undefined
            }
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
        {view === 'home' && config.buddy.chatEnabled && showBuddyChat && (
          <BuddyChatPanel
            onAction={runBuddyAction}
            voiceEnabled={config.buddy.voiceEnabled}
            onPhaseChange={setBuddyChatPhase}
            onClose={() => {
              setShowBuddyChat(false)
              setBuddyChatPhase('idle')
            }}
          />
        )}
        {toast && view === 'home' && !openBuiltin && <Toast message={toast} />}
        {view === 'home' && contactFlow.open && (
          <ContactOverlay
            state={contactFlow.state}
            busy={contactFlow.busy}
            now={now.getTime()}
            onClose={contactFlow.close}
            onStopMusic={
              musicState.currentId && musicState.state !== 'off' ? () => music.stop() : undefined
            }
          />
        )}
      </Stage>
      {toast && openBuiltin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: zLayers.toast, pointerEvents: 'none' }}>
          <Toast message={toast} />
        </div>
      )}

      {view === 'browser' && <VideoControls />}
      {view === 'browser' && !pageProblem && <ReaderView state={reader} />}
      {view === 'browser' && (
        <NavBar
          readerToggle={
            reader.available || reader.mode === 'loading' || reader.mode === 'article'
              ? {
                  article: reader.mode === 'article' || reader.mode === 'loading',
                  onToggle: () =>
                    void window.launcher.readerMode(
                      reader.mode === 'article' || reader.mode === 'loading' ? 'page' : 'article'
                    )
                }
              : undefined
          }
          message={toast}
          onHome={goHome}
          onBack={goBack}
          onStopMusic={
            musicState.currentId && musicState.state !== 'off' ? () => music.stop() : undefined
          }
        />
      )}
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
          musicStop={
            musicState.currentId &&
            musicState.state !== 'off' &&
            openBuiltin.builtinKey !== 'music' ? (
              <button className="music-inline-stop" data-music-stop onClick={() => music.stop()}>
                ■ Stop music
              </button>
            ) : undefined
          }
          onBrowsing={() => {
            setOpenBuiltin(null)
            setView('browser')
          }}
        />
      )}
      {showConfusion && (
        <ConfusionOverlay
          now={now}
          chatEnabled={config.buddy.chatEnabled}
          onClose={() => setShowConfusion(false)}
          onPlayMusic={() => {
            setShowConfusion(false)
            void window.launcher.buddyAction('playMusic').then((result) => {
              if (result.ok) {
                void runBuddyAction(result.plan)
              } else {
                setOpenBuiltin(
                  config.tiles.find(
                    (tile) => tile.type === 'builtin' && tile.builtinKey === 'music'
                  ) ?? {
                    id: 'confusion-music',
                    type: 'builtin',
                    builtinKey: 'music',
                    label: 'Music',
                    size: 'normal',
                    slot: null,
                    colorIndex: 2
                  }
                )
              }
            })
          }}
          onShowPhotos={() => void runBuddyAction({ action: 'showPhotos' })}
          onOpenChat={() => {
            setShowConfusion(false)
            if (config.buddy.chatEnabled) setShowBuddyChat(true)
          }}
        />
      )}
      {view === 'home' &&
        (showConfusion || showBuddyChat) &&
        musicState.currentId &&
        musicState.state !== 'off' && (
          <button
            className="music-global-stop"
            data-music-stop
            style={{ zIndex: zLayers.musicStop }}
            onClick={() => music.stop()}
          >
            ■ Stop music
          </button>
        )}
      <IdleDimOverlay
        dimmed={idleDimmed}
        level={config.display.idleDim.level}
        reducedMotion={config.buddy.motion === 'reduced'}
      />
    </div>
  )
}
