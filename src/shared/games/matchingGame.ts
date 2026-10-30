/**
 * Pure state machine for Matching Pairs.
 *
 * Designed for calm, errorless enjoyment:
 * - 6 cards (3 pairs) or 8 cards (4 pairs), never crowded.
 * - Uses caregiver-approved visible family photos when enabled and available,
 *   filling any remaining pairs from warm bundled SVG motifs.
 * - No timer, no move counter, and no wrong-move penalty: two non-matching
 *   cards stay visible briefly so she has time to enjoy the pictures before
 *   they turn back over.
 */

export const MATCHING_MOTIFS = [
  { id: 'sunflower', label: 'Sunflower', accent: '#331D05', bg: '#FFFCF5' },
  { id: 'teacup', label: 'Warm Teacup', accent: '#1C71B6', bg: '#FDF9EF' },
  { id: 'butterfly', label: 'Butterfly', accent: '#603EB2', bg: '#FFFCF5' },
  { id: 'songbird', label: 'Songbird', accent: '#174B32', bg: '#FDF9EF' },
  { id: 'sailboat', label: 'Sailboat', accent: '#348CCB', bg: '#FFFCF5' },
  { id: 'strawberry', label: 'Berry', accent: '#1D7844', bg: '#FDF9EF' }
] as const

export type MatchingMotifId = (typeof MATCHING_MOTIFS)[number]['id']

export type MatchingSource =
  | { kind: 'photo'; pairKey: string; label: string; imageUrl: string }
  | {
      kind: 'motif'
      pairKey: string
      label: string
      motifId: MatchingMotifId
      accent: string
      bg: string
    }

export type MatchingCard = MatchingSource & {
  cardId: string
  faceUp: boolean
  matched: boolean
}

export type MatchingState = {
  pairCount: 3 | 4
  cards: MatchingCard[]
  selectedIds: string[]
  completed: boolean
  statusMessage: string
}

export const MATCHING_MESSAGES = {
  start: 'Tap any two cards to find a matching pair.',
  oneOpen: 'Now tap a second card to see what is underneath.',
  match: 'Those two match nicely!',
  mismatch: 'Let us take a look and try another pair.',
  complete: 'Every pair is matched! Tap New Cards whenever you would like another round.'
} as const

export function shuffleItems<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    const temp = copy[i]!
    copy[i] = copy[j]!
    copy[j] = temp
  }
  return copy
}

export function createMatchingGame({
  pairCount = 3,
  photos = [],
  useFamilyPhotos = true,
  random = Math.random
}: {
  pairCount?: 3 | 4
  photos?: ReadonlyArray<{ id: string; url: string; caption?: string }>
  useFamilyPhotos?: boolean
  random?: () => number
} = {}): MatchingState {
  const sources: MatchingSource[] = []

  if (useFamilyPhotos && photos.length > 0) {
    const chosenPhotos = shuffleItems(photos, random).slice(0, pairCount)
    for (let i = 0; i < chosenPhotos.length; i++) {
      const p = chosenPhotos[i]!
      sources.push({
        kind: 'photo',
        pairKey: `photo:${p.id}`,
        label: p.caption?.trim() ? p.caption.trim() : `Family photo ${i + 1}`,
        imageUrl: p.url
      })
    }
  }

  if (sources.length < pairCount) {
    const chosenMotifs = shuffleItems(MATCHING_MOTIFS, random).slice(0, pairCount - sources.length)
    for (const motif of chosenMotifs) {
      sources.push({
        kind: 'motif',
        pairKey: `motif:${motif.id}`,
        label: motif.label,
        motifId: motif.id,
        accent: motif.accent,
        bg: motif.bg
      })
    }
  }

  const doubled: MatchingCard[] = sources.flatMap((source) => [
    { ...source, cardId: `${source.pairKey}:a`, faceUp: false, matched: false },
    { ...source, cardId: `${source.pairKey}:b`, faceUp: false, matched: false }
  ])

  return {
    pairCount,
    cards: shuffleItems(doubled, random),
    selectedIds: [],
    completed: false,
    statusMessage: MATCHING_MESSAGES.start
  }
}

export function flipMatchingCard(state: MatchingState, cardId: string): MatchingState {
  if (state.selectedIds.length >= 2) return state
  const target = state.cards.find((c) => c.cardId === cardId)
  if (!target || target.matched || target.faceUp) return state

  const nextSelected = [...state.selectedIds, cardId]
  const openedCards = state.cards.map((c) => (c.cardId === cardId ? { ...c, faceUp: true } : c))

  if (nextSelected.length === 1) {
    return {
      ...state,
      cards: openedCards,
      selectedIds: nextSelected,
      statusMessage: MATCHING_MESSAGES.oneOpen
    }
  }

  const [firstId, secondId] = nextSelected
  const first = openedCards.find((c) => c.cardId === firstId)
  const second = openedCards.find((c) => c.cardId === secondId)
  if (first && second && first.pairKey === second.pairKey) {
    const matchedCards = openedCards.map((c) =>
      c.pairKey === first.pairKey ? { ...c, matched: true, faceUp: true } : c
    )
    const completed = matchedCards.every((c) => c.matched)
    return {
      ...state,
      cards: matchedCards,
      selectedIds: [],
      completed,
      statusMessage: completed ? MATCHING_MESSAGES.complete : MATCHING_MESSAGES.match
    }
  }

  return {
    ...state,
    cards: openedCards,
    selectedIds: nextSelected,
    statusMessage: MATCHING_MESSAGES.mismatch
  }
}

export function settleMismatch(state: MatchingState): MatchingState {
  if (state.selectedIds.length < 2) return state
  return {
    ...state,
    cards: state.cards.map((c) => (c.matched ? c : { ...c, faceUp: false })),
    selectedIds: [],
    statusMessage: MATCHING_MESSAGES.start
  }
}
