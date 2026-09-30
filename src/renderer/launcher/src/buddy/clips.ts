import type { BuddyActivity, BuddyMotion } from '@shared/buddy/buddyMachine'

/**
 * Which animation clip goes with each thing Buddy does. The clips are baked
 * into assets/buddy.glb by scripts/blender/buildBuddy.sh (Meshy library
 * motions, re-fitted to his short legs and round belly); the names here are
 * the clip names in that file.
 *
 * `run` is available only as a deliberate caregiver command; unprompted
 * roaming always uses the calm walking clips.
 */
import type { ClipName } from '@shared/buddy/commands'
export type { ClipName } from '@shared/buddy/commands'

/**
 * Whether an activity's clip loops until something else replaces it, or plays
 * once and reports back (CLIP_DONE). It's the activity that decides, not the
 * clip: idle_soft is a looping idle, but as a fidget it must play once - a
 * fidget that never finished left him stuck fidgeting forever.
 */
const LOOPING_ACTIVITIES: ReadonlySet<BuddyActivity> = new Set([
  'resting',
  'strolling',
  'chat.attending',
  'chat.hearing',
  'chat.thinking'
])

export function loopsFor(activity: BuddyActivity): boolean {
  return LOOPING_ACTIVITIES.has(activity)
}

/** What he settles back into when a one-shot ends and nothing new has started. */
export function restingLoop(activity: BuddyActivity): ClipName {
  return activity.startsWith('chat.') ? 'listen' : 'idle_calm'
}

type Weighted = [ClipName, number][]

const POOLS: Record<BuddyActivity, Weighted> = {
  commanded: [['talk', 1]],
  greeting: [
    ['wave', 3],
    ['big_wave', 2],
    ['bow', 1]
  ],
  resting: [['idle_calm', 1]],
  fidgeting: [
    ['look_around', 3],
    ['idle_soft', 3],
    ['sway', 2],
    ['stretch', 2],
    ['dance', 1]
  ],
  // Walking is handled by movement, not by the activity; this is only a fallback.
  strolling: [['walk_casual', 1]],
  remarking: [
    ['talk_point', 2],
    ['beckon', 1],
    ['talk', 2]
  ],
  farewell: [
    ['wave', 3],
    ['heart', 2],
    ['bow', 1]
  ],
  'chat.hello': [
    ['wave', 2],
    ['big_wave', 1]
  ],
  'chat.attending': [['listen', 1]],
  'chat.hearing': [['listen', 1]],
  'chat.thinking': [['think', 1]],
  'chat.talking': [
    ['talk', 3],
    ['talk_point', 2],
    ['agree', 2],
    ['shrug', 1]
  ],
  'chat.petted': [
    ['heart', 3],
    ['cheer', 2],
    ['fist_pump', 2],
    ['happy_jump', 1],
    ['motivate', 1],
    ['dance', 1]
  ]
}

// At night: nothing bouncy, just the quiet idles.
const NIGHT_FIDGETS: Weighted = [
  ['idle_soft', 3],
  ['look_around', 1]
]

// Keep familiar, small gestures; remarks can show their bubble without beckoning her.
const REDUCED_CLIPS: Partial<Record<BuddyActivity, ClipName>> = {
  greeting: 'wave',
  fidgeting: 'idle_calm',
  remarking: 'idle_calm',
  farewell: 'wave',
  'chat.hello': 'wave',
  'chat.thinking': 'listen',
  'chat.talking': 'talk',
  'chat.petted': 'heart'
}

/**
 * Weighted pick for an activity, avoiding an immediate repeat of `last`
 * when the pool has anything else (two stretches in a row look robotic).
 */
export function pickClip(
  activity: BuddyActivity,
  opts: { random: () => number; night?: boolean; last?: ClipName | null; motion?: BuddyMotion }
): ClipName {
  if (opts.motion === 'reduced' && REDUCED_CLIPS[activity]) return REDUCED_CLIPS[activity]!
  const base = activity === 'fidgeting' && opts.night ? NIGHT_FIDGETS : POOLS[activity]
  const pool = base.length > 1 && opts.last ? base.filter(([name]) => name !== opts.last) : base
  const total = pool.reduce((sum, [, w]) => sum + w, 0)
  let r = opts.random() * total
  for (const [name, w] of pool) {
    r -= w
    if (r < 0) return name
  }
  return pool[pool.length - 1]![0]
}

/**
 * Walking speed that matches each walk clip's stride (measured in Blender:
 * how fast the planted foot slides back), so his feet don't skate.
 */
export const WALK_SPEED: Partial<Record<ClipName, number>> = { walk_casual: 0.29, walk: 0.46 }
