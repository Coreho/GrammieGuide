/**
 * Splits a line Buddy will say into pieces that can be voiced one after
 * another, so a long reply starts speaking once its first sentence is ready
 * instead of after the whole reply has been made. The local voice takes
 * about a third of real time on a fast PC and could be near real time on
 * hers; a 20-second reply would otherwise mean several seconds of silence.
 *
 * Short lines - nearly all of them - stay whole. The first piece is kept
 * short so it is ready soonest; later pieces may be longer, because each is
 * made while the one before it plays.
 */

const WHOLE_MAX = 160
const FIRST_MAX = 160
const FIRST_ENOUGH = 40
const REST_MAX = 240

/** Cuts a sentence that is too long on its own at a comma, else at a space. */
function splitLong(sentence: string, max: number): string[] {
  const pieces: string[] = []
  let rest = sentence
  while (rest.length > max) {
    const window = rest.slice(0, max + 1)
    const comma = window.lastIndexOf(', ')
    const space = window.lastIndexOf(' ')
    const cut = comma > max / 2 ? comma + 1 : space > 0 ? space : max
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pieces.push(rest)
  return pieces
}

export function speechChunks(text: string): string[] {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line) return []
  if (line.length <= WHOLE_MAX) return [line]
  // A sentence ends at . ! or ? followed by a space or the end, so "2.5 miles",
  // "3.30" and "bbc.co.uk" stay whole instead of being read as "two. five".
  const sentences = (line.match(/.+?(?:[.!?]+["')\]]*(?=\s|$)|$)/g) ?? [line])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap((sentence, i) => splitLong(sentence, i === 0 ? FIRST_MAX : REST_MAX))
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const first = chunks.length === 0
    const full = current.length + 1 + sentence.length > (first ? FIRST_MAX : REST_MAX)
    if (current && (full || (first && current.length >= FIRST_ENOUGH))) {
      chunks.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current) chunks.push(current)
  return chunks
}
