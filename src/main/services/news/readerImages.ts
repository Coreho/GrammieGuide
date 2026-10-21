import { READER_TAGS, type ReaderArticle, type ReaderNode } from '@shared/news/reader'
import { readerImage } from './newsService'

/** Rebuild the data tree at the process boundary. Never pass HTML or remote
 * URLs to Home, or broaden its CSP to accommodate a publisher's images. */
export async function prepareArticle(raw: unknown): Promise<ReaderArticle | null> {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as ReaderArticle
  if (
    typeof value.title !== 'string' ||
    typeof value.plainText !== 'string' ||
    value.plainText.length < 100 ||
    value.plainText.length > 1_000_000 ||
    !Array.isArray(value.nodes)
  )
    return null
  let remaining = 3000
  let images = 12
  const downloads: Promise<void>[] = []
  function clean(nodes: ReaderNode[], depth = 0): ReaderNode[] {
    if (depth > 30) return []
    return nodes.slice(0, 3000).flatMap((node): ReaderNode[] => {
      if (--remaining < 0) return []
      if (typeof node === 'string') return [node.slice(0, 100_000)]
      if (!node || !READER_TAGS.includes(node.tag) || !Array.isArray(node.children)) return []
      if (node.tag === 'img') {
        const image: Exclude<ReaderNode, string> = {
          tag: 'img',
          children: [],
          alt: typeof node.alt === 'string' ? node.alt.slice(0, 500) : ''
        }
        if (images-- > 0 && typeof node.src === 'string')
          downloads.push(
            readerImage(node.src).then((src) => {
              image.src = src
            })
          )
        return [image]
      }
      return [{ tag: node.tag, children: clean(node.children, depth + 1) }]
    })
  }
  const nodes = clean(value.nodes)
  await Promise.all(downloads)
  return {
    title: value.title.slice(0, 500),
    byline: typeof value.byline === 'string' ? value.byline.slice(0, 500) : '',
    date: typeof value.date === 'string' ? value.date.slice(0, 100) : '',
    nodes,
    plainText: value.plainText
  }
}
