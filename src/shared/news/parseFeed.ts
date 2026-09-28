import type { Story } from './types'
import { httpUrl } from './httpUrl'

type Element = {
  name: string
  attributes: Record<string, string>
  children: Element[]
  start: number
  raw: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  bull: '•',
  copy: '©',
  reg: '®'
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return ENTITIES[entity] ?? match
    const hex = entity[1]?.toLowerCase() === 'x'
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : ''
  })
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? '')
  }
  return result
}

/**
 * A small XML tokenizer, not an HTML renderer. The stack keeps item boundaries
 * intact when descriptions contain nested markup or CDATA with fake <item>s.
 * DTDs/entities are never expanded; malformed or overly nested feeds fail closed.
 */
function parseXml(xml: string): Element | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null
  const root: Element = { name: '', attributes: {}, children: [], start: 0, raw: '' }
  const stack = [root]
  const tokens =
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[\w:.-]+(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\/?>/g
  let last = 0
  for (const token of xml.matchAll(tokens)) {
    // A stray '<' means a broken tag, not a second chance to reinterpret it.
    if (xml.slice(last, token.index).includes('<')) return null
    const tag = token[0]
    last = token.index + tag.length
    if (tag.startsWith('<!') || tag.startsWith('<?')) continue
    const name = /^<\/?([\w:.-]+)/.exec(tag)![1]!.toLowerCase()
    if (tag.startsWith('</')) {
      const current = stack.pop()
      if (!current || current === root || current.name !== name) return null
      current.raw = xml.slice(current.start, token.index)
    } else {
      const element: Element = {
        name,
        attributes: attributes(tag),
        children: [],
        start: last,
        raw: ''
      }
      stack[stack.length - 1]!.children.push(element)
      if (!tag.endsWith('/>')) stack.push(element)
      if (stack.length > 128) return null
    }
  }
  return stack.length === 1 && !xml.slice(last).includes('<') ? root : null
}

function localName(node: Element): string {
  return node.name.split(':').pop()!
}

function value(node: Element | undefined): string {
  return decodeEntities((node?.raw ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
}

function plainText(raw: string): string {
  // Decode before stripping too: many feeds entity-encode their HTML inside CDATA.
  return decodeEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function field(node: Element, names: string[]): string {
  for (const name of names) {
    const found = node.children.find((child) =>
      name.includes(':') ? child.name === name : localName(child) === name
    )
    const text = value(found)
    if (text.trim()) return text
  }
  return ''
}

function descendants(node: Element): Element[] {
  return node.children.flatMap((child) => [child, ...descendants(child)])
}

function imageFor(item: Element, description: string, base: string): string | undefined {
  const all = descendants(item)
  // Media RSS first, then an image enclosure, then a description's first image.
  for (const name of ['media:content', 'media:thumbnail', 'enclosure']) {
    for (const node of all.filter((child) => child.name === name)) {
      const type = node.attributes.type
      if (name === 'enclosure' && !type?.toLowerCase().startsWith('image/')) continue
      if (name === 'media:content' && type && !type.toLowerCase().startsWith('image/')) continue
      const url = httpUrl(node.attributes.url, base)
      if (url) return url
    }
  }
  const tag = /<img\b[^>]*>/i.exec(description)?.[0]
  if (!tag) return undefined
  // HTML in descriptions can use unquoted attributes, unlike XML attributes.
  const src = attributes(tag).src ?? /\bsrc\s*=\s*([^\s"'=<>`]+)/i.exec(tag)?.[1]
  return httpUrl(src ? decodeEntities(src) : undefined, base) ?? undefined
}

/** RSS 2.0 and Atom only. All output is text; nothing here is trusted HTML. */
export function parseFeed(xml: string): Story[] {
  const root = parseXml(xml)
  const feed = root?.children.find((node) => ['rss', 'feed'].includes(localName(node)))
  if (!feed) return []
  const atom = localName(feed) === 'feed'
  const parent = atom ? feed : feed.children.find((node) => localName(node) === 'channel')
  if (!parent) return []
  const stories: Story[] = []
  const seen = new Set<string>()
  for (const item of parent.children.filter(
    (node) => localName(node) === (atom ? 'entry' : 'item')
  )) {
    const title = plainText(field(item, ['title']))
    const links = item.children.filter((node) => localName(node) === 'link')
    const link = atom
      ? (
          links.find((node) => node.attributes.rel === 'alternate') ??
          links.find((node) => node.attributes.href)
        )?.attributes.href
      : value(links[0])
    const url = httpUrl(link)
    if (!title || !url || seen.has(url)) continue
    seen.add(url)
    const description = field(item, ['description', 'summary', 'content', 'content:encoded'])
    const summary = plainText(description)
    const date = Date.parse(field(item, ['pubdate', 'published', 'updated', 'dc:date']))
    stories.push({
      id: url,
      title,
      url,
      publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
      summary: summary.length > 200 ? summary.slice(0, 197).trimEnd() + '…' : summary,
      imageUrl: imageFor(item, description, url)
    })
  }
  return stories
}
