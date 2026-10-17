import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, defaultConfig, configSchema } from '../../src/shared/configSchema'
import { runMigrations } from '../../src/main/config/migrations/runner'
import {
  BUILTIN_GAME_KEYS,
  gamesConfigSchema,
  installedGameSchema
} from '../../src/shared/games/gamesSchema'
import {
  createMatchingGame,
  flipMatchingCard,
  settleMismatch,
  MATCHING_MESSAGES
} from '../../src/shared/games/matchingGame'
import {
  buildJigsawPiecePath,
  buildPuzzlePictures,
  createPuzzleGame,
  getJigsawPieceEdges,
  isPuzzleSolved,
  tapPuzzleSlot
} from '../../src/shared/games/puzzleGame'
import {
  createTicTacToeGame,
  placePlayerMark,
  playComputerTurn
} from '../../src/shared/games/ticTacToeGame'
import { createMelodyGame, setMelodyMode, tapMelodyPad } from '../../src/shared/games/melodyGame'

describe('games config schema and migration 015', () => {
  it('defaults to all four built-in games enabled, family photos on, and no installed games', () => {
    const cfg = defaultConfig()
    expect(cfg.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(cfg.games).toEqual({
      enabledBuiltins: [...BUILTIN_GAME_KEYS],
      useFamilyPhotos: true,
      installedGames: []
    })
  })

  it('validates Windows paths for installed games and deduplicates enabledBuiltins', () => {
    expect(
      installedGameSchema.safeParse({
        id: 'solitaire',
        label: 'Solitaire',
        appPath: 'C:\\Games\\Solitaire.exe',
        colorIndex: 1
      }).success
    ).toBe(true)

    expect(
      installedGameSchema.safeParse({
        id: 'bad-path',
        label: 'Web link',
        appPath: 'https://example.com/game'
      }).success
    ).toBe(false)

    const parsed = gamesConfigSchema.parse({
      enabledBuiltins: ['matching', 'matching', 'puzzle'],
      useFamilyPhotos: false,
      installedGames: []
    })
    expect(parsed.enabledBuiltins).toEqual(['matching', 'puzzle'])
  })

  it('migrates v14 configs to v15 while preserving existing tiles and settings', () => {
    const v14 = {
      ...defaultConfig(),
      schemaVersion: 14,
      tiles: [
        {
          id: 'tile-1',
          type: 'builtin',
          builtinKey: 'weather',
          label: 'Weather',
          size: 'normal',
          slot: 0,
          colorIndex: 0
        }
      ]
    }
    delete (v14 as Record<string, unknown>).games
    const migrated = runMigrations(v14)
    expect(migrated.ok).toBe(true)
    if (migrated.ok) {
      expect(migrated.config.schemaVersion).toBe(15)
      expect(migrated.config.tiles).toEqual(v14.tiles)
      expect(migrated.config.games.enabledBuiltins).toEqual([...BUILTIN_GAME_KEYS])
      expect(migrated.config.games.useFamilyPhotos).toBe(true)
    }
  })

  it('allows built-in games tiles in configSchema', () => {
    const cfg = configSchema.parse({
      ...defaultConfig(),
      tiles: [
        {
          id: 'games-tile',
          type: 'builtin',
          builtinKey: 'games',
          label: 'Games',
          size: 'normal',
          slot: 0,
          colorIndex: 0
        }
      ]
    })
    expect(cfg.tiles[0]?.builtinKey).toBe('games')
  })
})

describe('Matching Pairs engine', () => {
  it('uses approved family photos when enabled and fills remaining pairs with bundled motifs', () => {
    const game = createMatchingGame({
      pairCount: 3,
      photos: [{ id: 'p1', url: 'grammie-media://photos/p1.jpg', caption: 'Garden rose' }],
      useFamilyPhotos: true,
      random: () => 0
    })
    expect(game.cards).toHaveLength(6)
    const photoCards = game.cards.filter((c) => c.kind === 'photo')
    expect(photoCards).toHaveLength(2)
    expect(photoCards[0]?.label).toBe('Garden rose')
  })

  it('matches identical pairs and settles non-matching pairs cleanly without penalty', () => {
    let state = createMatchingGame({ pairCount: 3, useFamilyPhotos: false, random: () => 0.5 })
    const first = state.cards[0]!
    const nonMatching = state.cards.find((c) => c.pairKey !== first.pairKey)!

    state = flipMatchingCard(state, first.cardId)
    expect(state.selectedIds).toEqual([first.cardId])

    state = flipMatchingCard(state, nonMatching.cardId)
    expect(state.statusMessage).toBe(MATCHING_MESSAGES.mismatch)
    expect(state.selectedIds).toHaveLength(2)

    state = settleMismatch(state)
    expect(state.selectedIds).toEqual([])
    expect(state.cards.every((c) => !c.faceUp)).toBe(true)

    // Now match all pairs
    const pairKeys = [...new Set(state.cards.map((c) => c.pairKey))]
    for (const key of pairKeys) {
      const pair = state.cards.filter((c) => c.pairKey === key)
      state = flipMatchingCard(state, pair[0]!.cardId)
      state = flipMatchingCard(state, pair[1]!.cardId)
    }
    expect(state.completed).toBe(true)
    expect(state.statusMessage).toBe(MATCHING_MESSAGES.complete)
  })
})

describe('Picture Puzzle engine', () => {
  it('starts unsolved and solves via two-tap swaps', () => {
    const pictures = buildPuzzlePictures(
      [{ id: 'p1', url: 'grammie-media://photos/p1.jpg', caption: 'Lake house' }],
      true
    )
    expect(pictures[0]?.kind).toBe('photo')

    let state = createPuzzleGame({ columns: 2, picture: pictures[0], random: () => 0.99 })
    expect(state.pieces).toHaveLength(4)
    expect(isPuzzleSolved(state.pieces)).toBe(false)

    // Select slot 0 then deselect by tapping slot 0 again
    state = tapPuzzleSlot(state, 0)
    expect(state.selectedSlot).toBe(0)
    state = tapPuzzleSlot(state, 0)
    expect(state.selectedSlot).toBeNull()

    // Solve by placing each piece into its home index
    for (let slot = 0; slot < state.pieces.length; slot++) {
      if (state.pieces[slot] === slot) continue
      const targetSlot = state.pieces.indexOf(slot)
      state = tapPuzzleSlot(state, slot)
      state = tapPuzzleSlot(state, targetSlot)
      if (state.completed) break
    }
    expect(state.completed).toBe(true)
    expect(isPuzzleSolved(state.pieces)).toBe(true)
  })

  it('generates complementary interlocking jigsaw edges and closed SVG paths for 2x2 and 3x2 grids', () => {
    for (const columns of [2, 3] as const) {
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < columns; col++) {
          const edges = getJigsawPieceEdges(col, row, columns, 2)
          if (row === 0) expect(edges.top).toBe('flat')
          if (row === 1) expect(edges.bottom).toBe('flat')
          if (col === 0) expect(edges.left).toBe('flat')
          if (col === columns - 1) expect(edges.right).toBe('flat')

          if (col + 1 < columns) {
            const rightNeighbor = getJigsawPieceEdges(col + 1, row, columns, 2)
            expect(new Set([edges.right, rightNeighbor.left])).toEqual(new Set(['tab', 'blank']))
          }
          if (row + 1 < 2) {
            const bottomNeighbor = getJigsawPieceEdges(col, row + 1, columns, 2)
            expect(new Set([edges.bottom, bottomNeighbor.top])).toEqual(new Set(['tab', 'blank']))
          }

          const path = buildJigsawPiecePath(col, row, columns, 2, 300, 200)
          expect(path.startsWith('M ')).toBe(true)
          expect(path.endsWith(' Z')).toBe(true)
          expect(path).toContain('C ')
        }
      }
    }
  })
})

describe('Gentle Tic-Tac-Toe engine', () => {
  it('lets the player place suns, takes a gentle computer turn, and detects a player win', () => {
    let state = createTicTacToeGame()
    state = placePlayerMark(state, 0)
    expect(state.turn).toBe('flower')
    state = playComputerTurn(state, () => 0.9) // picks last open square (8)
    expect(state.turn).toBe('sun')

    state = placePlayerMark(state, 1)
    state = playComputerTurn(state, () => 0.9) // picks last open square (7)

    state = placePlayerMark(state, 2)
    expect(state.winner).toBe('sun')
    expect(state.winningLine).toEqual([0, 1, 2])
  })
})

describe('Melody Chimes engine', () => {
  it('steps through a guided pattern without resetting on off-pattern taps', () => {
    let state = createMelodyGame({ mode: 'follow', random: () => 0 })
    const expectedFirst = state.pattern[0]!
    const otherPad = expectedFirst === 'amber' ? 'meadow' : 'amber'

    // Tapping another pad still records lastPlayedPad without resetting stepIndex
    state = tapMelodyPad(state, otherPad, () => 0)
    expect(state.lastPlayedPad).toBe(otherPad)
    expect(state.stepIndex).toBe(0)

    // Tapping the glowing pad advances stepIndex
    state = tapMelodyPad(state, expectedFirst, () => 0)
    expect(state.stepIndex).toBe(1)

    // Switching to free mode clears step progression requirements
    state = setMelodyMode(state, 'free')
    state = tapMelodyPad(state, 'violet')
    expect(state.mode).toBe('free')
    expect(state.lastPlayedPad).toBe('violet')
  })
})
