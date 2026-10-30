/**
 * Buddy's voice on this computer (Kokoro-82M, see services/speech/localVoice.ts):
 * the curated voices the caregiver can choose from. Kokoro has more, but its
 * own grades put these at the top for English; the rest sound noticeably
 * rougher. Male first: Buddy is a "he".
 */
export const LOCAL_VOICE_IDS = [
  'am_michael',
  'am_fenrir',
  'am_puck',
  'bm_george',
  'bm_fable',
  'af_heart',
  'af_bella'
] as const
export type LocalVoiceId = (typeof LOCAL_VOICE_IDS)[number]

export const LOCAL_VOICE_LABELS: Record<LocalVoiceId, string> = {
  am_michael: 'Michael - American, male',
  am_fenrir: 'Fenrir - American, male',
  am_puck: 'Puck - American, male',
  bm_george: 'George - British, male',
  bm_fable: 'Fable - British, male',
  af_heart: 'Heart - American, female',
  af_bella: 'Bella - American, female'
}

export const DEFAULT_LOCAL_VOICE: LocalVoiceId = 'am_michael'

/** A little slower than Kokoro's default, as the Windows fallback (rate 0.92) already is. */
export const LOCAL_VOICE_SPEED = 0.9

export function isLocalVoice(value: unknown): value is LocalVoiceId {
  return typeof value === 'string' && (LOCAL_VOICE_IDS as readonly string[]).includes(value)
}
