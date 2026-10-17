/**
 * Pure state machine for Picture Puzzle.
 *
 * Uses tap-to-swap (never drag-and-drop, which is tiring and error-prone on a
 * touch kiosk): tap one piece to highlight it, then tap a second piece to swap
 * their places. Supports 2x2 (4 pieces) and 3x2 (6 pieces) grids.
 */

export const PUZZLE_SCENES = [
  { id: 'meadow', title: 'Sunny Meadow', sky: '#D9EFF7', hills: '#78B884', sun: '#F5B82E' },
  { id: 'harbor', title: 'Quiet Harbor', sky: '#FDE8D0', hills: '#4B83B4', sun: '#E87A48' },
  { id: 'garden', title: 'Cottage Garden', sky: '#EAF4E2', hills: '#5E9D6E', sun: '#E5A93B' }
] as const

export type PuzzleSceneId = (typeof PUZZLE_SCENES)[number]['id']

export type PuzzlePicture =
  | { kind: 'photo'; id: string; title: string; imageUrl: string }
  | { kind: 'scene'; id: string; title: string; sceneId: PuzzleSceneId }

export type PuzzlePieceStyle = 'jigsaw' | 'cards'

export type JigsawEdge = 'flat' | 'tab' | 'blank'

export type JigsawPieceEdges = {
  top: JigsawEdge
  right: JigsawEdge
  bottom: JigsawEdge
  left: JigsawEdge
}

export type PuzzleGridSize = { columns: 2; rows: 2 } | { columns: 3; rows: 2 }

export type PuzzleState = {
  columns: 2 | 3
  rows: 2
  picture: PuzzlePicture
  /** For each board slot (0 .. total-1), holds the home piece index (0 .. total-1). */
  pieces: number[]
  selectedSlot: number | null
  completed: boolean
  statusMessage: string
}

/**
 * Returns the 4 edges (flat, tab, or blank) for piece (col, row).
 * Adjacent interior edges always have complementary tab/blank pairs.
 */
export function getJigsawPieceEdges(
  col: number,
  row: number,
  columns: 2 | 3,
  rows: 2 = 2
): JigsawPieceEdges {
  const rightSign = (c: number, r: number): 1 | -1 => ((c + r) % 2 === 0 ? 1 : -1)
  const bottomSign = (c: number, r: number): 1 | -1 => ((c + r) % 2 === 0 ? 1 : -1)

  const top: JigsawEdge =
    row === 0 ? 'flat' : bottomSign(col, row - 1) === 1 ? 'blank' : 'tab'
  const bottom: JigsawEdge =
    row === rows - 1 ? 'flat' : bottomSign(col, row) === 1 ? 'tab' : 'blank'
  const left: JigsawEdge =
    col === 0 ? 'flat' : rightSign(col - 1, row) === 1 ? 'blank' : 'tab'
  const right: JigsawEdge =
    col === columns - 1 ? 'flat' : rightSign(col, row) === 1 ? 'tab' : 'blank'

  return { top, right, bottom, left }
}

/**
 * Builds an SVG path in the [0..totalWidth, 0..totalHeight] picture space for
 * the jigsaw piece whose solved home position is (col, row).
 */
export function buildJigsawPiecePath(
  col: number,
  row: number,
  columns: 2 | 3,
  rows: 2 = 2,
  totalWidth = 300,
  totalHeight = 200
): string {
  const edges = getJigsawPieceEdges(col, row, columns, rows)
  const cellW = totalWidth / columns
  const cellH = totalHeight / rows
  const x0 = col * cellW
  const y0 = row * cellH
  const x1 = x0 + cellW
  const y1 = y0 + cellH
  const xm = (x0 + x1) / 2
  const ym = (y0 + y1) / 2

  const fmt = (n: number): string => Number(n.toFixed(2)).toString()

  // Horizontal edge helper: sign = -1 means knob points UP (-y), +1 means DOWN (+y)
  const horizEdge = (fromX: number, toX: number, y: number, edge: JigsawEdge, outwardSign: 1 | -1): string => {
    if (edge === 'flat') {
      return `L ${fmt(toX)} ${fmt(y)}`
    }
    const dir = edge === 'tab' ? outwardSign : (-outwardSign as 1 | -1)
    const dirX = toX > fromX ? 1 : -1
    const s = 0.18 * cellW * dirX
    const n = 0.1 * cellW * dirX
    const h = 0.17 * cellW * dirX
    const d = 0.16 * cellH * dir
    return [
      `L ${fmt(xm - s)} ${fmt(y)}`,
      `C ${fmt(xm - n)} ${fmt(y)} ${fmt(xm - h)} ${fmt(y + d * 0.35)} ${fmt(xm - n)} ${fmt(y + d * 0.65)}`,
      `C ${fmt(xm - h)} ${fmt(y + d * 1.08)} ${fmt(xm + h)} ${fmt(y + d * 1.08)} ${fmt(xm + n)} ${fmt(y + d * 0.65)}`,
      `C ${fmt(xm + h)} ${fmt(y + d * 0.35)} ${fmt(xm + n)} ${fmt(y)} ${fmt(xm + s)} ${fmt(y)}`,
      `L ${fmt(toX)} ${fmt(y)}`
    ].join(' ')
  }

  // Vertical edge helper: sign = +1 means knob points RIGHT (+x), -1 means LEFT (-x)
  const vertEdge = (x: number, fromY: number, toY: number, edge: JigsawEdge, outwardSign: 1 | -1): string => {
    if (edge === 'flat') {
      return `L ${fmt(x)} ${fmt(toY)}`
    }
    const dir = edge === 'tab' ? outwardSign : (-outwardSign as 1 | -1)
    const dirY = toY > fromY ? 1 : -1
    const s = 0.18 * cellH * dirY
    const n = 0.1 * cellH * dirY
    const h = 0.17 * cellH * dirY
    const d = 0.16 * cellW * dir
    return [
      `L ${fmt(x)} ${fmt(ym - s)}`,
      `C ${fmt(x)} ${fmt(ym - n)} ${fmt(x + d * 0.35)} ${fmt(ym - h)} ${fmt(x + d * 0.65)} ${fmt(ym - n)}`,
      `C ${fmt(x + d * 1.08)} ${fmt(ym - h)} ${fmt(x + d * 1.08)} ${fmt(ym + h)} ${fmt(x + d * 0.65)} ${fmt(ym + n)}`,
      `C ${fmt(x + d * 0.35)} ${fmt(ym + h)} ${fmt(x)} ${fmt(ym + n)} ${fmt(x)} ${fmt(ym + s)}`,
      `L ${fmt(x)} ${fmt(toY)}`
    ].join(' ')
  }

  return [
    `M ${fmt(x0)} ${fmt(y0)}`,
    horizEdge(x0, x1, y0, edges.top, -1),
    vertEdge(x1, y0, y1, edges.right, 1),
    horizEdge(x1, x0, y1, edges.bottom, 1),
    vertEdge(x0, y1, y0, edges.left, -1),
    'Z'
  ].join(' ')
}

export const PUZZLE_MESSAGES = {
  start: 'Tap a piece, then tap another piece to swap their places.',
  selected: 'Now tap the piece you would like to swap it with.',
  swapped: 'Nice move! Keep swapping until the picture comes together.',
  complete: 'The picture is complete! Tap Next Picture whenever you are ready.'
} as const

export function buildPuzzlePictures(
  photos: ReadonlyArray<{ id: string; url: string; caption?: string }>,
  useFamilyPhotos: boolean
): PuzzlePicture[] {
  const list: PuzzlePicture[] = []
  if (useFamilyPhotos) {
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i]!
      list.push({
        kind: 'photo',
        id: `photo:${p.id}`,
        title: p.caption?.trim() ? p.caption.trim() : `Family Photo ${i + 1}`,
        imageUrl: p.url
      })
    }
  }
  for (const scene of PUZZLE_SCENES) {
    list.push({
      kind: 'scene',
      id: `scene:${scene.id}`,
      title: scene.title,
      sceneId: scene.id
    })
  }
  return list
}

export function isPuzzleSolved(pieces: readonly number[]): boolean {
  return pieces.every((piece, index) => piece === index)
}

export function shufflePuzzlePieces(total: number, random: () => number = Math.random): number[] {
  const ordered = Array.from({ length: total }, (_, i) => i)
  const pieces = [...ordered]
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    const tmp = pieces[i]!
    pieces[i] = pieces[j]!
    pieces[j] = tmp
  }
  if (isPuzzleSolved(pieces) && total >= 2) {
    const first = pieces[0]!
    pieces[0] = pieces[1]!
    pieces[1] = first
  }
  return pieces
}

export function createPuzzleGame({
  columns = 2,
  picture,
  random = Math.random
}: {
  columns?: 2 | 3
  picture?: PuzzlePicture
  random?: () => number
} = {}): PuzzleState {
  const rows = 2
  const total = columns * rows
  const chosenPicture: PuzzlePicture = picture ?? {
    kind: 'scene',
    id: 'scene:meadow',
    title: 'Sunny Meadow',
    sceneId: 'meadow'
  }
  return {
    columns,
    rows,
    picture: chosenPicture,
    pieces: shufflePuzzlePieces(total, random),
    selectedSlot: null,
    completed: false,
    statusMessage: PUZZLE_MESSAGES.start
  }
}

export function tapPuzzleSlot(state: PuzzleState, slot: number): PuzzleState {
  if (state.completed) return state
  if (slot < 0 || slot >= state.pieces.length) return state

  if (state.selectedSlot === null) {
    return {
      ...state,
      selectedSlot: slot,
      statusMessage: PUZZLE_MESSAGES.selected
    }
  }

  if (state.selectedSlot === slot) {
    return {
      ...state,
      selectedSlot: null,
      statusMessage: PUZZLE_MESSAGES.start
    }
  }

  const nextPieces = [...state.pieces]
  const firstPiece = nextPieces[state.selectedSlot]!
  nextPieces[state.selectedSlot] = nextPieces[slot]!
  nextPieces[slot] = firstPiece

  const completed = isPuzzleSolved(nextPieces)
  return {
    ...state,
    pieces: nextPieces,
    selectedSlot: null,
    completed,
    statusMessage: completed ? PUZZLE_MESSAGES.complete : PUZZLE_MESSAGES.swapped
  }
}
