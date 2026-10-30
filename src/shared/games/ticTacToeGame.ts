/**
 * Pure state machine for Gentle Tic-Tac-Toe.
 *
 * Player places Warm Suns ('sun'), Buddy places Blossoms ('flower').
 * Buddy's move selector is intentionally gentle and forgiving: he notices an
 * immediate 3-in-a-row only part of the time, so she wins often and every
 * outcome is phrased warmly without any "You lost" message.
 */

export type TicTacToeMark = 'sun' | 'flower'
export type TicTacToeCell = TicTacToeMark | null

export type TicTacToeState = {
  board: TicTacToeCell[]
  turn: TicTacToeMark
  winner: TicTacToeMark | 'tie' | null
  winningLine: readonly [number, number, number] | null
  statusMessage: string
}

export const TICTACTOE_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
]

export const TICTACTOE_MESSAGES = {
  playerTurn: 'Your turn — tap any open square to place a sun.',
  computerTurn: 'Buddy is choosing a square…',
  playerWon: 'Three suns in a row — wonderful game!',
  computerWon: 'Three blossoms in a row! That was a fun round together.',
  tie: 'A friendly tie! Tap Play Again whenever you would like another round.'
} as const

export function createTicTacToeGame(): TicTacToeState {
  return {
    board: Array<TicTacToeCell>(9).fill(null),
    turn: 'sun',
    winner: null,
    winningLine: null,
    statusMessage: TICTACTOE_MESSAGES.playerTurn
  }
}

export function findWinner(board: readonly TicTacToeCell[]): {
  winner: TicTacToeMark | 'tie' | null
  line: readonly [number, number, number] | null
} {
  for (const line of TICTACTOE_LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark && mark === board[b] && mark === board[c]) {
      return { winner: mark, line }
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'tie', line: null }
  }
  return { winner: null, line: null }
}

function findLineMove(board: readonly TicTacToeCell[], mark: TicTacToeMark): number | null {
  for (const [a, b, c] of TICTACTOE_LINES) {
    const cells = [board[a], board[b], board[c]]
    const markCount = cells.filter((cell) => cell === mark).length
    const emptyCount = cells.filter((cell) => cell === null).length
    if (markCount === 2 && emptyCount === 1) {
      if (board[a] === null) return a
      if (board[b] === null) return b
      return c
    }
  }
  return null
}

/**
 * Picks a friendly computer move:
 * - Only takes a winning move or blocks her win 45% of the time so she can
 *   complete rows comfortably.
 * - Otherwise picks randomly among open squares.
 */
export function pickFriendlyComputerMove(
  board: readonly TicTacToeCell[],
  random: () => number = Math.random
): number | null {
  const open = board.flatMap((cell, idx) => (cell === null ? [idx] : []))
  if (open.length === 0) return null

  if (random() < 0.45) {
    const winMove = findLineMove(board, 'flower')
    if (winMove !== null) return winMove
    const blockMove = findLineMove(board, 'sun')
    if (blockMove !== null) return blockMove
  }

  const pickIndex = Math.min(open.length - 1, Math.floor(random() * open.length))
  return open[pickIndex]!
}

export function placePlayerMark(state: TicTacToeState, index: number): TicTacToeState {
  if (state.winner || state.turn !== 'sun') return state
  if (index < 0 || index >= 9 || state.board[index] !== null) return state

  const nextBoard = [...state.board]
  nextBoard[index] = 'sun'
  const outcome = findWinner(nextBoard)
  if (outcome.winner === 'sun') {
    return {
      board: nextBoard,
      turn: 'sun',
      winner: 'sun',
      winningLine: outcome.line,
      statusMessage: TICTACTOE_MESSAGES.playerWon
    }
  }
  if (outcome.winner === 'tie') {
    return {
      board: nextBoard,
      turn: 'sun',
      winner: 'tie',
      winningLine: null,
      statusMessage: TICTACTOE_MESSAGES.tie
    }
  }
  return {
    board: nextBoard,
    turn: 'flower',
    winner: null,
    winningLine: null,
    statusMessage: TICTACTOE_MESSAGES.computerTurn
  }
}

export function playComputerTurn(
  state: TicTacToeState,
  random: () => number = Math.random
): TicTacToeState {
  if (state.winner || state.turn !== 'flower') return state
  const move = pickFriendlyComputerMove(state.board, random)
  if (move === null) return state

  const nextBoard = [...state.board]
  nextBoard[move] = 'flower'
  const outcome = findWinner(nextBoard)
  if (outcome.winner === 'flower') {
    return {
      board: nextBoard,
      turn: 'sun',
      winner: 'flower',
      winningLine: outcome.line,
      statusMessage: TICTACTOE_MESSAGES.computerWon
    }
  }
  if (outcome.winner === 'tie') {
    return {
      board: nextBoard,
      turn: 'sun',
      winner: 'tie',
      winningLine: null,
      statusMessage: TICTACTOE_MESSAGES.tie
    }
  }
  return {
    board: nextBoard,
    turn: 'sun',
    winner: null,
    winningLine: null,
    statusMessage: TICTACTOE_MESSAGES.playerTurn
  }
}
