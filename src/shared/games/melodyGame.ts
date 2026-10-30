/**
 * Pure state machine and pentatonic chime definitions for Melody Chimes.
 *
 * Every pad belongs to a warm C-major pentatonic scale (C4, D4, E4, G4), so any
 * combination of taps sounds harmonious. Supports two gentle modes:
 * - 'free': tap any pad at her own pace to hear its chime.
 * - 'follow': highlights one glowing pad at a time in a 4-note song. Tapping the
 *   glowing pad steps forward; tapping any other pad still plays its pleasant
 *   chime without resetting or scolding.
 */

export const MELODY_PADS = [
  { id: 'amber', label: 'Warm C', noteName: 'C4', frequencyHz: 261.63, colorIndex: 0 },
  { id: 'meadow', label: 'Gentle D', noteName: 'D4', frequencyHz: 293.66, colorIndex: 1 },
  { id: 'sky', label: 'Bright E', noteName: 'E4', frequencyHz: 329.63, colorIndex: 2 },
  { id: 'violet', label: 'Sweet G', noteName: 'G4', frequencyHz: 392.0, colorIndex: 3 }
] as const

export type MelodyPadId = (typeof MELODY_PADS)[number]['id']
export type MelodyMode = 'free' | 'follow'

export type MelodyState = {
  mode: MelodyMode
  pattern: MelodyPadId[]
  stepIndex: number
  lastPlayedPad: MelodyPadId | null
  statusMessage: string
}

export const MELODY_MESSAGES = {
  freeStart: 'Tap any colored pad to play a gentle chime.',
  followStart: 'Tap the glowing pad to follow the tune, or play any note you like.',
  followStep: 'Lovely note! Tap the next glowing pad when you are ready.',
  followComplete: 'What a pretty tune! Here is a new gentle melody to follow.'
} as const

export function generateMelodyPattern(
  length = 4,
  random: () => number = Math.random
): MelodyPadId[] {
  const result: MelodyPadId[] = []
  for (let i = 0; i < length; i++) {
    const candidates =
      result.length > 0 ? MELODY_PADS.filter((p) => p.id !== result[result.length - 1]) : MELODY_PADS
    const idx = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
    result.push(candidates[idx]!.id)
  }
  return result
}

export function createMelodyGame({
  mode = 'follow',
  random = Math.random
}: {
  mode?: MelodyMode
  random?: () => number
} = {}): MelodyState {
  return {
    mode,
    pattern: generateMelodyPattern(4, random),
    stepIndex: 0,
    lastPlayedPad: null,
    statusMessage: mode === 'follow' ? MELODY_MESSAGES.followStart : MELODY_MESSAGES.freeStart
  }
}

export function setMelodyMode(
  state: MelodyState,
  mode: MelodyMode,
  random: () => number = Math.random
): MelodyState {
  return {
    mode,
    pattern: mode === 'follow' ? generateMelodyPattern(4, random) : state.pattern,
    stepIndex: 0,
    lastPlayedPad: null,
    statusMessage: mode === 'follow' ? MELODY_MESSAGES.followStart : MELODY_MESSAGES.freeStart
  }
}

export function tapMelodyPad(
  state: MelodyState,
  padId: MelodyPadId,
  random: () => number = Math.random
): MelodyState {
  if (state.mode === 'free') {
    return {
      ...state,
      lastPlayedPad: padId,
      statusMessage: MELODY_MESSAGES.freeStart
    }
  }

  const targetPad = state.pattern[state.stepIndex]
  if (padId !== targetPad) {
    // Errorless: still chimes the pad she tapped and keeps her current place in the song.
    return {
      ...state,
      lastPlayedPad: padId
    }
  }

  const nextStep = state.stepIndex + 1
  if (nextStep >= state.pattern.length) {
    return {
      ...state,
      pattern: generateMelodyPattern(state.pattern.length, random),
      stepIndex: 0,
      lastPlayedPad: padId,
      statusMessage: MELODY_MESSAGES.followComplete
    }
  }

  return {
    ...state,
    stepIndex: nextStep,
    lastPlayedPad: padId,
    statusMessage: MELODY_MESSAGES.followStep
  }
}
