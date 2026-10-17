import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes
} from 'react'
import { zLayers } from '@shared/zLayers'
import {
  BUILTIN_GAME_DESCRIPTIONS,
  BUILTIN_GAME_KEYS,
  BUILTIN_GAME_LABELS,
  type BuiltinGameKey,
  type InstalledGame
} from '@shared/games/gamesSchema'
import {
  createMatchingGame,
  flipMatchingCard,
  settleMismatch,
  type MatchingMotifId,
  type MatchingState
} from '@shared/games/matchingGame'
import {
  buildJigsawPiecePath,
  buildPuzzlePictures,
  createPuzzleGame,
  tapPuzzleSlot,
  type PuzzlePieceStyle,
  type PuzzlePicture,
  type PuzzleSceneId,
  type PuzzleState
} from '@shared/games/puzzleGame'
import {
  createTicTacToeGame,
  placePlayerMark,
  playComputerTurn,
  type TicTacToeState
} from '@shared/games/ticTacToeGame'
import {
  createMelodyGame,
  MELODY_PADS,
  setMelodyMode,
  tapMelodyPad,
  type MelodyPadId,
  type MelodyState
} from '@shared/games/melodyGame'
import type { Photo } from '@shared/media/photoTypes'
import { TILE_SHADOW, TILE_SHADOW_ACTIVE, tileBackground, tileInk } from '../clay'
import { useLabelFit } from '../components/useLabelFit'
import type { BuiltinViewProps } from './builtins'
import './GamesOverlay.css'

export function GamesOverlay({ tile, config, onClose, musicStop }: BuiltinViewProps) {
  const [activeGame, setActiveGame] = useState<BuiltinGameKey | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [hubStatus, setHubStatus] = useState<string | null>(null)
  const homeBtnRef = useRef<HTMLButtonElement>(null)
  const surfaceRef = useRef<HTMLElement>(null)
  const reducedMotion = config.buddy.motion === 'reduced'

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    homeBtnRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    let live = true
    window.launcher
      .listPhotos()
      .then((list) => {
        if (live) setPhotos(list)
      })
      .catch(() => {
        if (live) setPhotos([])
      })
    const off = window.launcher.onPhotosChanged(() => {
      void window.launcher.listPhotos().then(
        (list) => {
          if (live) setPhotos(list)
        },
        () => {}
      )
    })
    return () => {
      live = false
      off()
    }
  }, [])

  const enabledBuiltins = useMemo(
    () => BUILTIN_GAME_KEYS.filter((key) => config.games.enabledBuiltins.includes(key)),
    [config.games.enabledBuiltins]
  )
  const installedGames = config.games.installedGames

  useEffect(() => {
    if (activeGame && !enabledBuiltins.includes(activeGame)) {
      setActiveGame(null)
    }
  }, [activeGame, enabledBuiltins])

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (activeGame) setActiveGame(null)
        else onClose()
        return
      }
      if (event.key !== 'Tab') return
      const controls =
        surfaceRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!controls || controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !surfaceRef.current?.contains(active))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (active === last || !surfaceRef.current?.contains(active))) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeGame, onClose])

  function openBuiltinGame(game: BuiltinGameKey): void {
    setHubStatus(null)
    setActiveGame(game)
    void window.launcher.reportBuiltinGame?.(game)
  }

  async function launchInstalled(game: InstalledGame): Promise<void> {
    setHubStatus(`Opening ${game.label}…`)
    const result = await window.launcher.openInstalledGame(game.id)
    if (!result.ok) {
      setHubStatus(`${game.label} isn't ready right now. Try another game.`)
    } else {
      setHubStatus(null)
    }
  }

  const hasAnyGames = enabledBuiltins.length > 0 || installedGames.length > 0

  return (
    <div
      className="games-overlay"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={{ zIndex: zLayers.gamesOverlay }}
    >
      <section
        ref={surfaceRef}
        className="games-surface"
        role="dialog"
        aria-modal="true"
        aria-label={activeGame ? BUILTIN_GAME_LABELS[activeGame] : tile.label}
      >
        <header className="games-header">
          <div className="games-header-group">
            <button
              ref={homeBtnRef}
              className="games-nav-btn"
              data-game-interactive
              onClick={onClose}
            >
              <HomeGlyph />
              <span>Back to Home</span>
            </button>
            {activeGame && (
              <button
                className="games-nav-btn"
                data-game-interactive
                onClick={() => setActiveGame(null)}
              >
                <BackGlyph />
                <span>Other games</span>
              </button>
            )}
            <h1>{activeGame ? BUILTIN_GAME_LABELS[activeGame] : tile.label}</h1>
          </div>
          <div className="games-header-group">{musicStop}</div>
        </header>

        {!activeGame && !hasAnyGames && (
          <p className="games-empty" role="status">
            {tile.label} is not set up yet.
          </p>
        )}

        {!activeGame && hasAnyGames && (
          <>
            {hubStatus && (
              <p className="games-status" role="status">
                {hubStatus}
              </p>
            )}
            <div className="games-hub-grid" aria-label="Available games">
              {enabledBuiltins.map((key, index) => (
                <HubGameCard
                  key={key}
                  label={BUILTIN_GAME_LABELS[key]}
                  description={BUILTIN_GAME_DESCRIPTIONS[key]}
                  colorIndex={index % 4}
                  icon={<BuiltinGameEmblem game={key} />}
                  onClick={() => openBuiltinGame(key)}
                />
              ))}
              {installedGames.map((item) => (
                <HubGameCard
                  key={item.id}
                  label={item.label}
                  description="Opens on this computer"
                  colorIndex={item.colorIndex}
                  icon={<InstalledGameEmblem />}
                  onClick={() => void launchInstalled(item)}
                />
              ))}
            </div>
          </>
        )}

        {activeGame === 'matching' && (
          <MatchingPairsView photos={photos} useFamilyPhotos={config.games.useFamilyPhotos} />
        )}
        {activeGame === 'puzzle' && (
          <PicturePuzzleView photos={photos} useFamilyPhotos={config.games.useFamilyPhotos} />
        )}
        {activeGame === 'tictactoe' && <TicTacToeView />}
        {activeGame === 'melody' && <MelodyChimesView />}
      </section>
    </div>
  )
}

function HubGameCard({
  label,
  description,
  colorIndex,
  icon,
  ...props
}: {
  label: string
  description: string
  colorIndex: number
  icon: React.ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const labelRef = useLabelFit<HTMLElement>(label, label)
  return (
    <button
      {...props}
      className="games-hub-card"
      data-game-interactive
      style={{
        background: tileBackground(colorIndex),
        color: tileInk(colorIndex),
        boxShadow: TILE_SHADOW
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW_ACTIVE
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
    >
      <div className="games-hub-well" aria-hidden="true">
        {icon}
      </div>
      <div className="games-hub-copy">
        <strong ref={labelRef}>{label}</strong>
        <span>{description}</span>
      </div>
    </button>
  )
}

function MatchingPairsView({
  photos,
  useFamilyPhotos
}: {
  photos: Photo[]
  useFamilyPhotos: boolean
}) {
  const [pairCount, setPairCount] = useState<3 | 4>(3)
  const [state, setState] = useState<MatchingState>(() =>
    createMatchingGame({ pairCount: 3, photos, useFamilyPhotos })
  )

  const startNewRound = useCallback(
    (nextPairs: 3 | 4 = pairCount) => {
      setPairCount(nextPairs)
      setState(createMatchingGame({ pairCount: nextPairs, photos, useFamilyPhotos }))
    },
    [pairCount, photos, useFamilyPhotos]
  )

  // If photos load after opening the game and no card has been turned over yet, include them.
  const seededWithPhotos = useRef(false)
  useEffect(() => {
    if (useFamilyPhotos && photos.length > 0 && !seededWithPhotos.current) {
      seededWithPhotos.current = true
      if (state.cards.every((c) => !c.faceUp && !c.matched)) {
        setState(createMatchingGame({ pairCount, photos, useFamilyPhotos: true }))
      }
    }
  }, [photos, useFamilyPhotos, pairCount, state.cards])

  useEffect(() => {
    if (state.selectedIds.length < 2) return
    const timer = window.setTimeout(() => {
      setState((prev) => settleMismatch(prev))
    }, 1100)
    return () => window.clearTimeout(timer)
  }, [state.selectedIds])

  return (
    <div className="games-board-area">
      <div className="games-header-group">
        <p className="games-status" aria-live="polite">
          {state.statusMessage}
        </p>
        <button
          className="games-nav-btn"
          data-game-interactive
          aria-pressed={pairCount === 3}
          onClick={() => startNewRound(3)}
        >
          6 Cards
        </button>
        <button
          className="games-nav-btn"
          data-game-interactive
          aria-pressed={pairCount === 4}
          onClick={() => startNewRound(4)}
        >
          8 Cards
        </button>
        <button
          className="games-nav-btn"
          data-game-interactive
          onClick={() => startNewRound(pairCount)}
        >
          New Cards
        </button>
      </div>

      <div className="matching-grid" data-pairs={pairCount}>
        {state.cards.map((card, index) => {
          const revealed = card.faceUp || card.matched
          return (
            <button
              key={card.cardId}
              className="matching-card"
              data-game-interactive
              data-matched={card.matched ? 'true' : 'false'}
              aria-label={
                revealed ? `${card.label}${card.matched ? ', matched' : ''}` : `Card ${index + 1}`
              }
              style={{
                background: revealed
                  ? card.kind === 'motif'
                    ? card.bg
                    : 'var(--s1, #fffcf5)'
                  : tileBackground(index % 4),
                color: revealed ? '#30291f' : tileInk(index % 4)
              }}
              onClick={() => setState((prev) => flipMatchingCard(prev, card.cardId))}
            >
              {revealed ? (
                <>
                  {card.kind === 'photo' ? (
                    <img
                      className="matching-card-photo"
                      src={card.imageUrl}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <MotifIllustration motifId={card.motifId} accent={card.accent} />
                  )}
                  <span className="matching-card-label">{card.label}</span>
                </>
              ) : (
                <CardBackEmblem />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PicturePuzzleView({
  photos,
  useFamilyPhotos
}: {
  photos: Photo[]
  useFamilyPhotos: boolean
}) {
  const pictures = useMemo(
    () => buildPuzzlePictures(photos, useFamilyPhotos),
    [photos, useFamilyPhotos]
  )
  const [pictureIndex, setPictureIndex] = useState(0)
  const [columns, setColumns] = useState<2 | 3>(2)
  const [pieceStyle, setPieceStyle] = useState<PuzzlePieceStyle>('jigsaw')
  const currentPicture = pictures[pictureIndex % pictures.length]!
  const [state, setState] = useState<PuzzleState>(() =>
    createPuzzleGame({ columns: 2, picture: currentPicture })
  )

  useEffect(() => {
    setState(createPuzzleGame({ columns, picture: currentPicture }))
  }, [columns, currentPicture])

  return (
    <div className="games-board-area">
      <div className="games-header-group puzzle-controls-bar">
        <p className="games-status" aria-live="polite">
          {state.statusMessage}
        </p>
        <div className="puzzle-controls-row">
          <button
            className="games-nav-btn"
            data-game-interactive
            aria-pressed={pieceStyle === 'jigsaw'}
            onClick={() => setPieceStyle('jigsaw')}
          >
            Jigsaw
          </button>
          <button
            className="games-nav-btn"
            data-game-interactive
            aria-pressed={pieceStyle === 'cards'}
            onClick={() => setPieceStyle('cards')}
          >
            Cards
          </button>
          <button
            className="games-nav-btn"
            data-game-interactive
            aria-pressed={columns === 2}
            onClick={() => setColumns(2)}
          >
            4 Pieces
          </button>
          <button
            className="games-nav-btn"
            data-game-interactive
            aria-pressed={columns === 3}
            onClick={() => setColumns(3)}
          >
            6 Pieces
          </button>
          <button
            className="games-nav-btn"
            data-game-interactive
            onClick={() => setPictureIndex((i) => (i + 1) % pictures.length)}
          >
            Next Picture
          </button>
        </div>
      </div>

      <div className="puzzle-stage-layout">
        <aside className="puzzle-guide-card" aria-label={`Picture Guide: ${state.picture.title}`}>
          <span className="puzzle-guide-heading">Picture Guide</span>
          <div className="puzzle-guide-frame">
            {state.picture.kind === 'photo' ? (
              <img
                className="puzzle-guide-photo"
                src={state.picture.imageUrl}
                alt={state.picture.title}
                draggable={false}
              />
            ) : (
              <PuzzleSceneFull sceneId={state.picture.sceneId} />
            )}
          </div>
          <strong className="puzzle-guide-title">{state.picture.title}</strong>
        </aside>

        <div
          className="puzzle-board-tray"
          data-style={pieceStyle}
          data-completed={state.completed ? 'true' : 'false'}
        >
          <div
            className="puzzle-grid"
            data-columns={state.columns}
            data-style={pieceStyle}
            data-completed={state.completed ? 'true' : 'false'}
          >
            {state.pieces.map((pieceHomeIndex, slotIndex) => {
              const homeCol = pieceHomeIndex % state.columns
              const homeRow = Math.floor(pieceHomeIndex / state.columns)
              const selected = state.selectedSlot === slotIndex
              const inPlace = pieceHomeIndex === slotIndex

              return (
                <button
                  key={slotIndex}
                  className="puzzle-piece"
                  data-game-interactive
                  data-style={pieceStyle}
                  data-selected={selected ? 'true' : 'false'}
                  data-in-place={inPlace ? 'true' : 'false'}
                  aria-label={`Puzzle space ${slotIndex + 1}, showing piece ${pieceHomeIndex + 1}${
                    selected ? ', selected' : ''
                  }`}
                  style={
                    pieceStyle === 'cards' && state.picture.kind === 'photo'
                      ? {
                          backgroundImage: `url("${state.picture.imageUrl}")`,
                          backgroundSize: `${state.columns * 100}% ${state.rows * 100}%`,
                          backgroundPosition: `${
                            state.columns > 1 ? (homeCol / (state.columns - 1)) * 100 : 0
                          }% ${state.rows > 1 ? (homeRow / (state.rows - 1)) * 100 : 0}%`
                        }
                      : undefined
                  }
                  onClick={() => setState((prev) => tapPuzzleSlot(prev, slotIndex))}
                >
                  {pieceStyle === 'jigsaw' ? (
                    <PuzzleJigsawPiece
                      picture={state.picture}
                      columns={state.columns}
                      rows={state.rows}
                      homeCol={homeCol}
                      homeRow={homeRow}
                      slotIndex={slotIndex}
                      selected={selected}
                      inPlace={inPlace}
                    />
                  ) : (
                    state.picture.kind === 'scene' && (
                      <PuzzleSceneSlice
                        sceneId={state.picture.sceneId}
                        columns={state.columns}
                        rows={state.rows}
                        col={homeCol}
                        row={homeRow}
                      />
                    )
                  )}
                  <span className="puzzle-piece-badge" data-in-place={inPlace ? 'true' : 'false'}>
                    {inPlace ? `✓ ${pieceHomeIndex + 1}` : pieceHomeIndex + 1}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function TicTacToeView() {
  const [state, setState] = useState<TicTacToeState>(() => createTicTacToeGame())

  useEffect(() => {
    if (state.winner || state.turn !== 'flower') return
    const timer = window.setTimeout(() => {
      setState((prev) => playComputerTurn(prev))
    }, 550)
    return () => window.clearTimeout(timer)
  }, [state.winner, state.turn])

  return (
    <div className="games-board-area">
      <div className="games-header-group">
        <p className="games-status" aria-live="polite">
          {state.statusMessage}
        </p>
        <button
          className="games-nav-btn"
          data-game-interactive
          onClick={() => setState(createTicTacToeGame())}
        >
          Play Again
        </button>
      </div>

      <div className="ttt-board" role="group" aria-label="Tic-Tac-Toe board">
        {state.board.map((cell, idx) => {
          const isWinning = state.winningLine?.includes(idx) ?? false
          const row = Math.floor(idx / 3) + 1
          const col = (idx % 3) + 1
          return (
            <button
              key={idx}
              className="ttt-cell"
              data-game-interactive
              data-winning={isWinning ? 'true' : 'false'}
              disabled={cell !== null || state.winner !== null || state.turn !== 'sun'}
              aria-label={`Row ${row} Column ${col}${
                cell === 'sun' ? ', Sun' : cell === 'flower' ? ', Blossom' : ', empty'
              }`}
              onClick={() => setState((prev) => placePlayerMark(prev, idx))}
            >
              {cell === 'sun' && <SunPieceSvg />}
              {cell === 'flower' && <BlossomPieceSvg />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function playGentleChime(frequencyHz: number): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequencyHz, now)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.78)
    osc.onended = () => {
      void ctx.close().catch(() => {})
    }
  } catch {
    // Web Audio unavailable in headless/restricted environment; visual feedback still works.
  }
}

function MelodyChimesView() {
  const [state, setState] = useState<MelodyState>(() => createMelodyGame({ mode: 'follow' }))

  function handlePadTap(padId: MelodyPadId, frequencyHz: number): void {
    playGentleChime(frequencyHz)
    setState((prev) => tapMelodyPad(prev, padId))
  }

  const targetPad = state.mode === 'follow' ? state.pattern[state.stepIndex] : null

  return (
    <div className="games-board-area">
      <div className="games-header-group">
        <p className="games-status" aria-live="polite">
          {state.statusMessage}
        </p>
        <button
          className="games-nav-btn"
          data-game-interactive
          aria-pressed={state.mode === 'follow'}
          onClick={() => setState((prev) => setMelodyMode(prev, 'follow'))}
        >
          Follow the Tune
        </button>
        <button
          className="games-nav-btn"
          data-game-interactive
          aria-pressed={state.mode === 'free'}
          onClick={() => setState((prev) => setMelodyMode(prev, 'free'))}
        >
          Free Play
        </button>
      </div>

      <div className="melody-grid">
        {MELODY_PADS.map((pad) => {
          const glowing = targetPad === pad.id
          return (
            <button
              key={pad.id}
              className="melody-pad"
              data-game-interactive
              data-glowing={glowing ? 'true' : 'false'}
              aria-label={`${pad.label}${glowing ? ', glowing next note' : ''}`}
              style={{
                background: tileBackground(pad.colorIndex),
                color: tileInk(pad.colorIndex),
                boxShadow: TILE_SHADOW
              }}
              onClick={() => handlePadTap(pad.id, pad.frequencyHz)}
            >
              <ChimeNoteGlyph />
              <span className="melody-pad-title">{pad.label}</span>
              <span className="melody-pad-subtitle">
                {glowing ? 'Tap this glowing note next' : 'Tap to chime'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function HomeGlyph() {
  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  )
}

function BackGlyph() {
  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  )
}

function BuiltinGameEmblem({ game }: { game: BuiltinGameKey }) {
  if (game === 'matching') {
    return (
      <svg
        width={54}
        height={54}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="11" height="14" rx="2.5" />
        <path d="M14 7h4.5A2.5 2.5 0 0 1 21 9.5v9a2.5 2.5 0 0 1-2.5 2.5H11" />
        <circle cx="8.5" cy="12" r="2.2" />
      </svg>
    )
  }
  if (game === 'puzzle') {
    return (
      <svg
        width={54}
        height={54}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 5h5c0-1.6 1.2-2.6 2.5-2.6S15 3.4 15 5h4v5c1.6 0 2.6 1.2 2.6 2.5S20.6 15 19 15v4h-5c0-1.5-1.1-2.5-2.5-2.5S9 17.5 9 19H5v-4c1.5 0 2.5-1.1 2.5-2.5S6.5 10 5 10V5Z" />
      </svg>
    )
  }
  if (game === 'tictactoe') {
    return (
      <svg
        width={54}
        height={54}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
      >
        <path d="M9 4v16M15 4v16M4 9h16M4 15h16" />
      </svg>
    )
  }
  return <ChimeNoteGlyph />
}

function InstalledGameEmblem() {
  return (
    <svg
      width={54}
      height={54}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="M8 12h4M10 10v4" />
      <circle cx="15.5" cy="11" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ChimeNoteGlyph() {
  return (
    <svg
      width={54}
      height={54}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  )
}

function CardBackEmblem() {
  return (
    <svg
      width={72}
      height={72}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ opacity: 0.85 }}
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function MotifIllustration({ motifId, accent }: { motifId: MatchingMotifId; accent: string }) {
  return (
    <svg
      width={88}
      height={88}
      viewBox="0 0 64 64"
      fill="none"
      stroke={accent}
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {motifId === 'sunflower' && (
        <>
          <circle cx="32" cy="32" r="10" fill={accent} />
          <path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6" />
        </>
      )}
      {motifId === 'teacup' && (
        <>
          <path d="M14 26h28v10a14 14 0 0 1-28 0V26Z" fill={accent} fillOpacity={0.2} />
          <path d="M42 28h5a5 5 0 0 1 0 10h-5" />
          <path d="M10 46h36" />
        </>
      )}
      {motifId === 'butterfly' && (
        <>
          <path d="M32 18v28" />
          <path
            d="M32 26C22 14 10 18 12 30c2 8 12 8 20 4Z"
            fill={accent}
            fillOpacity={0.22}
          />
          <path
            d="M32 26c10-12 22-8 20 4-2 8-12 8-20 4Z"
            fill={accent}
            fillOpacity={0.22}
          />
        </>
      )}
      {motifId === 'songbird' && (
        <>
          <path
            d="M16 38c6-12 20-14 28-6 4 4 4 12-4 14H20c-4 0-6-4-4-8Z"
            fill={accent}
            fillOpacity={0.22}
          />
          <path d="m46 28 6-2-4 5" />
          <circle cx="38" cy="29" r="1.8" fill={accent} />
        </>
      )}
      {motifId === 'sailboat' && (
        <>
          <path d="M32 12v28M32 14 18 36h14M32 18l12 18H32" fill={accent} fillOpacity={0.2} />
          <path d="M12 42h40l-6 8H18l-6-8Z" />
        </>
      )}
      {motifId === 'strawberry' && (
        <>
          <path
            d="M32 18c12 0 16 10 12 22-3 8-8 12-12 12s-9-4-12-12c-4-12 0-22 12-22Z"
            fill={accent}
            fillOpacity={0.22}
          />
          <path d="m26 14 6 4 6-4M32 12v6" />
        </>
      )}
    </svg>
  )
}

/**
 * Rich 300x200 scene illustrations designed so every quadrant (2x2) and every
 * sixth (3x2) contains distinct, high-contrast landmarks (never a blank sky piece).
 */
function PuzzleSceneElements({ sceneId }: { sceneId: PuzzleSceneId }) {
  if (sceneId === 'meadow') {
    return (
      <>
        {/* Sky & distant hills across all columns */}
        <rect x="0" y="0" width="300" height="200" fill="#CFEAF7" />
        <path d="M0 115 L65 62 L135 110 L215 56 L300 108 L300 200 L0 200 Z" fill="#A9C8DC" />
        {/* Top-left (0..100, 0..100): Fluffy cloud, bluebirds, and apple tree canopy */}
        <g fill="#FFFFFF">
          <circle cx="34" cy="30" r="14" />
          <circle cx="50" cy="26" r="17" />
          <circle cx="66" cy="31" r="13" />
        </g>
        <path
          d="M74 48 Q80 41 86 48 Q92 41 98 48"
          fill="none"
          stroke="#2E5E88"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Apple tree spanning left column (top-left canopy + bottom-left trunk) */}
        <rect x="38" y="90" width="16" height="58" rx="4" fill="#7C4D2B" />
        <circle cx="46" cy="74" r="28" fill="#2A854E" />
        <circle cx="28" cy="84" r="20" fill="#1D7844" />
        <circle cx="64" cy="84" r="20" fill="#3BA162" />
        <circle cx="38" cy="68" r="5" fill="#E04F44" />
        <circle cx="56" cy="76" r="5" fill="#E04F44" />
        <circle cx="28" cy="86" r="5" fill="#E04F44" />
        {/* Top-right (200..300, 0..100): Radiant sun and rays */}
        <circle cx="248" cy="46" r="26" fill="#FFC82C" stroke="#E59A10" strokeWidth="3" />
        <g stroke="#F5B82E" strokeWidth="3.5" strokeLinecap="round">
          <path d="M248 10v7M248 75v7M212 46h7M277 46h7M223 21l5 5M268 66l5 5M273 21l-5 5M228 66l-5 5" />
        </g>
        {/* Rolling green hills across middle & bottom */}
        <path d="M0 128 Q85 92 175 124 T300 116 L300 200 L0 200 Z" fill="#7AC497" />
        <path d="M0 156 Q125 128 235 158 T300 148 L300 200 L0 200 Z" fill="#1D7844" />
        {/* Center (100..200, 50..145): Red-roofed country cottage + winding path */}
        <rect x="158" y="54" width="10" height="22" fill="#8C4A32" />
        <circle cx="164" cy="44" r="6" fill="#FFFFFF" fillOpacity="0.85" />
        <circle cx="172" cy="34" r="8" fill="#FFFFFF" fillOpacity="0.7" />
        <rect x="118" y="78" width="64" height="46" rx="4" fill="#FFFDF7" stroke="#504738" strokeWidth="2.5" />
        <polygon points="110,80 150,48 190,80" fill="#D44D3E" stroke="#504738" strokeWidth="2.5" />
        <rect x="142" y="98" width="16" height="26" rx="3" fill="#8C4A32" />
        <rect x="125" y="88" width="12" height="12" rx="2" fill="#FFE07D" stroke="#504738" strokeWidth="2" />
        <rect x="163" y="88" width="12" height="12" rx="2" fill="#FFE07D" stroke="#504738" strokeWidth="2" />
        {/* Winding path in bottom-middle (100..200, 124..200) */}
        <path d="M142 124 Q130 156 154 200 L182 200 Q158 156 158 124 Z" fill="#F2D28B" />
        {/* Bottom-left (0..100, 100..200): White wooden fence & wildflowers */}
        <g fill="#FFFDF7" stroke="#504738" strokeWidth="1.8">
          <rect x="14" y="138" width="8" height="32" rx="2" />
          <rect x="34" y="138" width="8" height="32" rx="2" />
          <rect x="54" y="138" width="8" height="32" rx="2" />
          <rect x="74" y="138" width="8" height="32" rx="2" />
          <rect x="10" y="146" width="76" height="6" rx="2" />
          <rect x="10" y="158" width="76" height="6" rx="2" />
        </g>
        <circle cx="26" cy="182" r="7" fill="#FFC82C" />
        <circle cx="52" cy="186" r="7" fill="#F0788C" />
        <circle cx="78" cy="180" r="7" fill="#FFC82C" />
        {/* Bottom-right (200..300, 100..200): Blue meadow pond & yellow duck */}
        <ellipse cx="246" cy="168" rx="42" ry="20" fill="#348CCB" stroke="#BCE5CB" strokeWidth="3" />
        <ellipse cx="244" cy="164" rx="11" ry="7" fill="#FFC82C" />
        <circle cx="253" cy="157" r="6" fill="#FFC82C" />
        <polygon points="258,157 265,155 258,160" fill="#E87A48" />
      </>
    )
  }

  if (sceneId === 'harbor') {
    return (
      <>
        {/* Warm coastal sky */}
        <rect x="0" y="0" width="300" height="200" fill="#FDE8D0" />
        <path d="M0 84 Q150 56 300 84 L300 130 L0 130 Z" fill="#F9CFA5" />
        {/* Top-left (0..100, 0..100): Sunset sun, clouds, and gulls */}
        <circle cx="48" cy="48" r="24" fill="#FFC82C" stroke="#E87A48" strokeWidth="4" />
        <g fill="#FFFDF7">
          <circle cx="74" cy="64" r="11" />
          <circle cx="86" cy="62" r="13" />
        </g>
        <path
          d="M22 86 Q28 79 34 86 Q40 79 46 86"
          fill="none"
          stroke="#504738"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        {/* Top-middle & bottom-middle (100..200, 0..200): Big sailboat with striped sails */}
        <g fill="#FFFDF7">
          <circle cx="122" cy="28" r="12" />
          <circle cx="138" cy="25" r="15" />
          <circle cx="154" cy="29" r="11" />
        </g>
        {/* Top-right & bottom-right (200..300, 0..200): Red-and-white coastal lighthouse on cliff */}
        <path d="M212 132 Q245 96 300 112 L300 142 L212 142 Z" fill="#6D7A88" />
        <polygon points="242,112 248,38 266,38 272,112" fill="#FFFDF7" stroke="#30291F" strokeWidth="2.5" />
        <polygon points="244,88 246,66 268,66 270,88" fill="#D44D3E" />
        <rect x="245" y="28" width="24" height="11" rx="2" fill="#FFC82C" stroke="#30291F" strokeWidth="2" />
        <polygon points="241,28 257,14 273,28" fill="#D44D3E" stroke="#30291F" strokeWidth="2" />
        {/* Harbor water across bottom row */}
        <rect x="0" y="122" width="300" height="78" fill="#2A7BB8" />
        <path d="M0 146 Q45 138 90 146 T180 146 T270 146 T300 146" fill="none" stroke="#89CBEB" strokeWidth="3.5" />
        <path d="M0 176 Q55 168 110 176 T220 176 T300 176" fill="none" stroke="#BCE5CB" strokeWidth="3.5" />
        {/* Center sailboat */}
        <line x1="150" y1="38" x2="150" y2="136" stroke="#30291F" strokeWidth="3.5" />
        <polygon points="150,40 168,46 150,52" fill="#FFC82C" />
        <polygon points="146,46 146,122 106,116" fill="#FFFDF7" stroke="#30291F" strokeWidth="2" />
        <polygon points="154,54 154,122 192,116" fill="#E87A48" stroke="#30291F" strokeWidth="2" />
        <polygon points="108,124 192,124 176,146 124,146" fill="#D44D3E" stroke="#30291F" strokeWidth="2.5" />
        {/* Bottom-left (0..100, 100..200): Little yellow boat & wooden buoy */}
        <polygon points="20,152 82,152 72,170 30,170" fill="#FFC82C" stroke="#30291F" strokeWidth="2.5" />
        <rect x="42" y="136" width="20" height="16" rx="3" fill="#FFFDF7" stroke="#30291F" strokeWidth="2" />
        {/* Bottom-right (200..300, 100..200): Jumping dolphin / waves & coastal pines */}
        <circle cx="230" cy="110" r="12" fill="#1D7844" />
        <circle cx="282" cy="108" r="14" fill="#2A854E" />
        <circle cx="252" cy="166" r="10" fill="#FFC82C" stroke="#FFFDF7" strokeWidth="3" />
      </>
    )
  }

  // 'garden' ("Cottage Garden")
  return (
    <>
      <rect x="0" y="0" width="300" height="200" fill="#EAF4E2" />
      {/* Top-left (0..100, 0..100): Rose trellis arch & orange butterfly */}
      <path
        d="M18 125 V48 A32 32 0 0 1 82 48 V125"
        fill="none"
        stroke="#8C583A"
        strokeWidth="6"
      />
      <circle cx="24" cy="54" r="9" fill="#E04F44" />
      <circle cx="50" cy="24" r="10" fill="#F0788C" />
      <circle cx="76" cy="52" r="9" fill="#E04F44" />
      <ellipse cx="52" cy="64" rx="10" ry="7" fill="#FFC82C" stroke="#30291F" strokeWidth="2" />
      {/* Top-middle (100..200, 0..100): Stone birdbath & bluebird */}
      <ellipse cx="150" cy="68" rx="34" ry="10" fill="#D5CFC2" stroke="#504738" strokeWidth="2.5" />
      <ellipse cx="150" cy="66" rx="26" ry="6" fill="#6BB6E8" />
      <rect x="142" y="76" width="16" height="44" rx="4" fill="#C4BCAE" stroke="#504738" strokeWidth="2.5" />
      <circle cx="134" cy="56" r="9" fill="#348CCB" />
      <polygon points="124,56 116,53 124,60" fill="#FFC82C" />
      {/* Top-right (200..300, 0..100): Golden sun & tall purple hollyhocks */}
      <circle cx="256" cy="40" r="22" fill="#FFC82C" stroke="#E59A10" strokeWidth="3" />
      <line x1="224" y1="44" x2="224" y2="132" stroke="#1D7844" strokeWidth="5" />
      <circle cx="224" cy="52" r="9" fill="#7857CD" />
      <circle cx="224" cy="72" r="10" fill="#9B7EDE" />
      <circle cx="224" cy="92" r="10" fill="#7857CD" />
      {/* Garden lawn across bottom row */}
      <path d="M0 116 Q150 96 300 116 L300 200 L0 200 Z" fill="#5E9D6E" />
      <path d="M0 144 Q150 124 300 144 L300 200 L0 200 Z" fill="#2A7B46" />
      {/* Bottom-left (0..100, 100..200): Giant sunflowers in terracotta pot */}
      <polygon points="30,152 74,152 66,188 38,188" fill="#C9643B" stroke="#30291F" strokeWidth="2.5" />
      <circle cx="40" cy="128" r="16" fill="#FFC82C" stroke="#5C3A16" strokeWidth="4" />
      <circle cx="66" cy="134" r="15" fill="#FFC82C" stroke="#5C3A16" strokeWidth="4" />
      {/* Bottom-middle (100..200, 100..200): Stepping stones & blue hydrangeas */}
      <ellipse cx="150" cy="142" rx="22" ry="9" fill="#E6DEC8" stroke="#504738" strokeWidth="2" />
      <ellipse cx="146" cy="168" rx="26" ry="10" fill="#E6DEC8" stroke="#504738" strokeWidth="2" />
      <circle cx="114" cy="154" r="14" fill="#348CCB" />
      <circle cx="186" cy="154" r="14" fill="#F0788C" />
      {/* Bottom-right (200..300, 100..200): Cozy ginger cat & watering can */}
      <rect x="228" y="142" width="38" height="28" rx="8" fill="#FFC82C" stroke="#30291F" strokeWidth="2.5" />
      <circle cx="268" cy="146" r="12" fill="#E89A28" stroke="#30291F" strokeWidth="2.5" />
      <polygon points="260,136 264,126 270,136" fill="#E89A28" />
      <polygon points="268,136 274,126 278,136" fill="#E89A28" />
    </>
  )
}

function PuzzleSceneFull({ sceneId }: { sceneId: PuzzleSceneId }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <PuzzleSceneElements sceneId={sceneId} />
    </svg>
  )
}

function PuzzleSceneSlice({
  sceneId,
  columns,
  rows,
  col,
  row
}: {
  sceneId: PuzzleSceneId
  columns: number
  rows: number
  col: number
  row: number
}) {
  const sliceW = 300 / columns
  const sliceH = 200 / rows
  const viewBox = `${col * sliceW} ${row * sliceH} ${sliceW} ${sliceH}`
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <PuzzleSceneElements sceneId={sceneId} />
    </svg>
  )
}

function PuzzleJigsawPiece({
  picture,
  columns,
  rows,
  homeCol,
  homeRow,
  slotIndex,
  selected,
  inPlace
}: {
  picture: PuzzlePicture
  columns: 2 | 3
  rows: 2
  homeCol: number
  homeRow: number
  slotIndex: number
  selected: boolean
  inPlace: boolean
}) {
  const cellW = 300 / columns
  const cellH = 200 / rows
  const padX = cellW * 0.22
  const padY = cellH * 0.22
  const minX = homeCol * cellW - padX
  const minY = homeRow * cellH - padY
  const vbW = cellW + padX * 2
  const vbH = cellH + padY * 2
  const piecePath = useMemo(
    () => buildJigsawPiecePath(homeCol, homeRow, columns, rows, 300, 200),
    [homeCol, homeRow, columns, rows]
  )
  const clipId = `jigsaw-clip-${columns}-${slotIndex}-${homeCol}-${homeRow}`

  return (
    <svg
      className="puzzle-jigsaw-svg"
      viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={piecePath} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {picture.kind === 'photo' ? (
          <image
            href={picture.imageUrl}
            x="0"
            y="0"
            width="300"
            height="200"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <PuzzleSceneElements sceneId={picture.sceneId} />
        )}
      </g>
      <path
        d={piecePath}
        fill="none"
        stroke={selected ? '#FFC82C' : inPlace ? '#1D7844' : '#30291F'}
        strokeWidth={selected ? 5.5 : inPlace ? 3.8 : 2.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SunPieceSvg() {
  return (
    <svg
      width={78}
      height={78}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#331D05"
      strokeWidth={4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="13" fill="#FFC82C" />
      <path d="M32 8v7M32 49v7M8 32h7M49 32h7M15 15l5 5M44 44l5 5M49 15l-5 5M20 44l-5 5" />
    </svg>
  )
}

function BlossomPieceSvg() {
  return (
    <svg
      width={78}
      height={78}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#603EB2"
      strokeWidth={3.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="32" cy="18" r="9" fill="#BCE5CB" />
      <circle cx="46" cy="32" r="9" fill="#BCE5CB" />
      <circle cx="32" cy="46" r="9" fill="#BCE5CB" />
      <circle cx="18" cy="32" r="9" fill="#BCE5CB" />
      <circle cx="32" cy="32" r="7" fill="#FFC82C" />
    </svg>
  )
}
