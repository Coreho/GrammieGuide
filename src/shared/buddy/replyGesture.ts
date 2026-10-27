import type { ClipName } from './commands'

/**
 * Which gesture Buddy opens a spoken line with, read from the line itself.
 * The chat prompt is frozen, so the model can't tag its own mood; this looks
 * for plain cues instead. Most lines match nothing and keep the usual
 * talking gestures - a wrong guess (a cheer for sad news) is worse than none,
 * so every cue is a whole word or phrase, and sad words veto the happy ones.
 */

const SAD = /\b(?:sorry|sad|miss(?:ed|ing)?|lost|passed away|hurts?|worried|afraid|lonely)\b/

const CUES: [RegExp, ClipName][] = [
  [/^(?:hello|hi|good (?:morning|afternoon|evening)|goodbye|bye|see you)\b/, 'wave'],
  [/\b(?:thank you|thanks)\b/, 'bow'],
  [/\b(?:hooray|congratulations|well done|happy birthday|great news|wonderful news)\b/, 'cheer'],
  // Not "dear": "oh dear" usually comes before something hard.
  [/\b(?:love|lovely|sweet|warm hug|so glad|happy to)\b/, 'heart'],
  [/^(?:yes|of course|that's right|exactly|indeed|absolutely|i agree)\b/, 'agree'],
  [/\b(?:let me think|i wonder|good question|hmm)\b/, 'think']
]

const COMFORT: [RegExp, ClipName][] = [[/\b(?:i'm here|with you|take your time)\b/, 'heart']]

export function gestureForReply(text: string): ClipName | null {
  const line = text.toLowerCase().replace(/[’]/g, "'").trim()
  if (!line) return null
  // Sad news still deserves a gentle gesture, never a cheer.
  const cues = SAD.test(line) ? COMFORT : CUES
  for (const [cue, clip] of cues) if (cue.test(line)) return clip
  return null
}
