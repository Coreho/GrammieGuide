/**
 * The one rule for everything that makes sound or uses the microphone:
 * music, a photo's recorded narration, Buddy's voice, Buddy listening, and
 * web pages in the embedded browser. The old app had no such rule, so any
 * two of them could talk over each other; here every player reports what it
 * is doing and asks this rule what to do, instead of each one deciding.
 *
 * The rule, in her terms:
 * - Music always gives way. Anything that needs her ears or the microphone
 *   holds it: Buddy listening, a narration, a chat with Buddy and a web page
 *   making sound pause it; a line from Buddy outside a chat lowers it.
 * - Music gets quieter at once, but only comes back RESUME_DELAY_MS after
 *   whatever held it has ended, so a quick back-and-forth doesn't make it
 *   stop and start (and a second line from Buddy doesn't let it blare in
 *   between). A whole chat pauses it rather than each turn, for the same reason.
 * - One voice at a time: the newest voice plays and the one before it stops.
 *   While Buddy listens, no voice plays at all, so the microphone hears only her.
 * - Web page sound is muted while any voice plays or Buddy listens.
 * - Her own choices win. Music she paused stays paused after a hold ends,
 *   and Stop works in every state; while music is on, a Stop shows on every
 *   screen, including over a web page (where Home's controls are hidden).
 *
 * Pure: the caller passes the time, applies the decision to the real
 * players, and re-asks at `changesAt`. Positions within a track are the
 * player's business; "held" only means paused by this rule, not by her.
 */

/**
 * What can need quiet. `chat` is the chat panel being open, `webPage` an
 * embedded page that is audible right now (going quiet and closing both end it).
 */
export type AudioSource = 'listening' | 'narration' | 'buddyVoice' | 'chat' | 'webPage'

/** What she last asked the music to do. */
export type MusicIntent = 'off' | 'playing' | 'paused'

type Quiet = 'none' | 'lower' | 'pause'

const QUIET_RANK: Record<Quiet, number> = { none: 0, lower: 1, pause: 2 }

/** How much quiet each source needs from music. */
const MUSIC_QUIET: Record<AudioSource, Quiet> = {
  // The microphone must not pick the music up.
  listening: 'pause',
  // A family member telling the story behind a photo: every word matters.
  narration: 'pause',
  // A chat alternates listening, thinking and talking; pausing for the whole
  // chat avoids the music stopping and starting on every turn.
  chat: 'pause',
  // A video and a song can't sensibly share the speakers.
  webPage: 'pause',
  // His lines outside a chat are short (a tap reaction, a caregiver's message):
  // lowering the song is gentler than stopping it for "Hello!".
  buddyVoice: 'lower'
}

const VOICES: ReadonlySet<AudioSource> = new Set(['narration', 'buddyVoice'])
/** Sources that page sound must never play over. */
const MUTES_WEB_PAGE: ReadonlySet<AudioSource> = new Set(['listening', 'narration', 'buddyVoice'])

/** How long music waits, after whatever held it ends, before it comes back. */
export const RESUME_DELAY_MS = 2000
/** Music volume (of the OS ceiling) while lowered under Buddy: about -12 dB. */
export const MUSIC_LOWERED_VOLUME = 0.25

export type AudioState = {
  readonly music: MusicIntent
  /** What is active now, by the caller's id for it. */
  readonly holds: Readonly<Record<string, AudioSource>>
  /** After a hold ends, music keeps this much quiet until `until`. */
  readonly linger: { readonly quiet: Quiet; readonly until: number } | null
}

export type AudioEvent =
  /** She pressed Play (or Buddy started her music for her). */
  | { type: 'musicPlay' }
  /** She pressed Pause. */
  | { type: 'musicPause' }
  /** She pressed Stop, auto-stop fired, or the playlist gave up. */
  | { type: 'musicStop' }
  /** A source became active. `id` must be unique per sound (each line, each narration). */
  | { type: 'start'; source: AudioSource; id: string }
  /** A source ended. Ending an id that isn't active (one that was cut off) does nothing. */
  | { type: 'end'; id: string }

export type AudioStep = {
  state: AudioState
  /** Ids of voices the caller must stop now (cut off, or refused while listening). */
  stop: string[]
}

export type AudioDecision = {
  /**
   * What the music player should be doing: `held` means paused by this rule
   * and coming back by itself; `paused` means she paused it.
   */
  music: 'off' | 'paused' | 'held' | 'lowered' | 'playing'
  /** Volume to give the music player: 1, MUSIC_LOWERED_VOLUME, or 0 when it must not be heard. */
  musicVolume: number
  /** Show a Stop for music on every screen, including the browser's nav bar. */
  showStopMusic: boolean
  /** Mute the embedded web page's sound. */
  muteWebPage: boolean
  /** When this decision changes with no new event (music coming back), or null. */
  changesAt: number | null
}

export const initialAudioState: AudioState = { music: 'off', holds: {}, linger: null }

function louder(a: Quiet, b: Quiet): Quiet {
  return QUIET_RANK[a] >= QUIET_RANK[b] ? a : b
}

function activeQuiet(holds: AudioState['holds']): Quiet {
  return Object.values(holds).reduce<Quiet>((q, source) => louder(q, MUSIC_QUIET[source]), 'none')
}

function lingerAt(state: AudioState, now: number): Quiet {
  return state.linger && now < state.linger.until ? state.linger.quiet : 'none'
}

function quietAt(state: AudioState, now: number): Quiet {
  return louder(activeQuiet(state.holds), lingerAt(state, now))
}

/**
 * Removes holds and, if that makes music louder, keeps the quiet it had for
 * RESUME_DELAY_MS more.
 */
function withoutHolds(state: AudioState, ids: string[], now: number): AudioState {
  if (ids.length === 0) return state
  const holds = { ...state.holds }
  for (const id of ids) delete holds[id]
  const before = quietAt(state, now)
  const linger =
    QUIET_RANK[activeQuiet(holds)] < QUIET_RANK[before]
      ? { quiet: before, until: now + RESUME_DELAY_MS }
      : state.linger
  return { ...state, holds, linger }
}

function start(state: AudioState, source: AudioSource, id: string, now: number): AudioStep {
  if (state.holds[id] === source) return { state, stop: [] }
  // An id reused for a different source ends the old one first.
  const base = Object.hasOwn(state.holds, id) ? withoutHolds(state, [id], now) : state
  const others = Object.entries(base.holds)
  const isVoice = VOICES.has(source)

  if (isVoice && others.some(([, s]) => s === 'listening')) return { state: base, stop: [id] }

  // Listening silences every voice; a new voice replaces the one before it.
  const stop =
    isVoice || source === 'listening'
      ? others.filter(([, s]) => VOICES.has(s)).map(([other]) => other)
      : []
  const remaining = withoutHolds(base, stop, now)
  return { state: { ...remaining, holds: { ...remaining.holds, [id]: source } }, stop }
}

/** Applies one event. Pure: returns the next state and any voices to stop. */
export function audioStep(state: AudioState, event: AudioEvent, now: number): AudioStep {
  switch (event.type) {
    case 'musicPlay':
      // A fresh Play honors only what is active now, not a pending resume delay.
      return { state: { ...state, music: 'playing', linger: null }, stop: [] }
    case 'musicPause':
      return {
        state: state.music === 'playing' ? { ...state, music: 'paused' } : state,
        stop: []
      }
    case 'musicStop':
      return { state: { ...state, music: 'off', linger: null }, stop: [] }
    case 'start':
      return start(state, event.source, event.id, now)
    case 'end':
      return Object.hasOwn(state.holds, event.id)
        ? { state: withoutHolds(state, [event.id], now), stop: [] }
        : { state, stop: [] }
  }
}

/** What every player should be doing at `now`. */
export function decideAudio(state: AudioState, now: number): AudioDecision {
  const quiet = quietAt(state, now)
  const music: AudioDecision['music'] =
    state.music !== 'playing'
      ? state.music
      : quiet === 'pause'
        ? 'held'
        : quiet === 'lower'
          ? 'lowered'
          : 'playing'
  // Music she paused or stopped doesn't change by itself, so only playing music has a resume due.
  const pendingResume =
    state.music === 'playing' &&
    QUIET_RANK[lingerAt(state, now)] > QUIET_RANK[activeQuiet(state.holds)]

  return {
    music,
    musicVolume: music === 'playing' ? 1 : music === 'lowered' ? MUSIC_LOWERED_VOLUME : 0,
    showStopMusic: state.music !== 'off',
    muteWebPage: Object.values(state.holds).some((source) => MUTES_WEB_PAGE.has(source)),
    changesAt: pendingResume && state.linger ? state.linger.until : null
  }
}
