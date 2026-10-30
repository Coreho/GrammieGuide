export const READER_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'ul',
  'ol',
  'li',
  'figure',
  'figcaption',
  'strong',
  'em',
  'b',
  'i',
  'br',
  'img'
] as const
export type ReaderTag = (typeof READER_TAGS)[number]
export type ReaderNode =
  string | { tag: ReaderTag; children: ReaderNode[]; src?: string; alt?: string }
export interface ReaderArticle {
  title: string
  byline: string
  date: string
  nodes: ReaderNode[]
  plainText: string
}
export interface ReaderState {
  mode: 'none' | 'page' | 'loading' | 'article'
  available: boolean
  headline: string
  article: ReaderArticle | null
}
export const EMPTY_READER: ReaderState = {
  mode: 'none',
  available: false,
  headline: '',
  article: null
}

/** Smaller than the voice service's 1,200-character ceiling, including long words. */
export function speechChunks(text: string): string[] {
  const chunks: string[] = []
  let rest = text.trim()
  while (rest.length) {
    let end = Math.min(1100, rest.length)
    if (end < rest.length) {
      const boundary = rest.lastIndexOf(' ', end)
      if (boundary > end / 2) end = boundary
    }
    chunks.push(rest.slice(0, end))
    rest = rest.slice(end).trimStart()
  }
  return chunks
}

export async function readChunks(
  text: string,
  speak: (chunk: string) => Promise<void>,
  isCurrent: () => boolean
): Promise<void> {
  for (const chunk of speechChunks(text)) {
    if (!isCurrent()) return
    await speak(chunk)
  }
}
