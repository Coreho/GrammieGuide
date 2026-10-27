import DOMPurify from 'dompurify'
import { READER_TAGS, type ReaderNode, type ReaderTag } from '@shared/news/reader'

/** Return data, never executable markup. React renders the same small allow-list. */
export function sanitizeReader(html: string): { nodes: ReaderNode[]; plainText: string } {
  const fragment = DOMPurify.sanitize(html.slice(0, 1_000_000), {
    ALLOWED_TAGS: [...READER_TAGS],
    ALLOWED_ATTR: ['src', 'alt'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true
  })
  let remaining = 3000
  function convert(node: Node): ReaderNode[] {
    if (--remaining < 0) return []
    if (node.nodeType === 3) return [node.textContent ?? '']
    if (node.nodeType !== 1) return []
    const el = node as Element
    const tag = el.tagName.toLowerCase() as ReaderTag
    if (!READER_TAGS.includes(tag)) return []
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? ''
      try {
        const url = new URL(src)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return []
        return [
          { tag, src: url.href, alt: (el.getAttribute('alt') ?? '').slice(0, 500), children: [] }
        ]
      } catch {
        return []
      }
    }
    return [{ tag, children: [...el.childNodes].flatMap(convert) }]
  }
  const nodes = [...fragment.childNodes].flatMap(convert)
  const text = (items: ReaderNode[]): string =>
    items
      .map((n) =>
        typeof n === 'string'
          ? n
          : text(n.children) +
            (['p', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote', 'br'].includes(n.tag) ? '\n' : '')
      )
      .join('')
  return { nodes, plainText: text(nodes).trim() }
}
