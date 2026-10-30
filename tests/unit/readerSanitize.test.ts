// @vitest-environment jsdom
import { it, expect } from 'vitest'
import { sanitizeReader } from '../../src/preload/readerSanitize'
import { speechChunks, readChunks } from '../../src/shared/news/reader'

it('keeps article order and text while removing active markup, links and unsafe images', () => {
  const result = sanitizeReader(
    '<h2>Garden</h2><p onclick="evil()">Hello <a href="https://evil.test">friend</a>.</p><script>evil()</script><iframe src="https://evil.test"></iframe><img src="javascript:evil()" onerror="evil()"><img src="data:image/png;base64,AA"><img src="https://example.com/garden.jpg" alt="Roses" onload="evil()"><blockquote>Take a seat.</blockquote>'
  )
  expect(result.nodes).toEqual([
    { tag: 'h2', children: ['Garden'] },
    { tag: 'p', children: ['Hello ', 'friend', '.'] },
    { tag: 'img', children: [], src: 'https://example.com/garden.jpg', alt: 'Roses' },
    { tag: 'blockquote', children: ['Take a seat.'] }
  ])
  expect(result.plainText).toBe('Garden\nHello friend.\nTake a seat.')
})
it('reads every character of long articles in chunks below the service ceiling', () => {
  const text = ('A long story about the garden. '.repeat(250) + 'x'.repeat(2400)).trim()
  const chunks = speechChunks(text)
  expect(chunks.length).toBeGreaterThan(3)
  expect(chunks.every((c) => c.length <= 1100)).toBe(true)
  expect(chunks.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
})
it('does not request the next speech chunk once she leaves the article', async () => {
  let active = true
  const spoken: string[] = []
  await readChunks(
    'a'.repeat(4000),
    async (chunk) => {
      spoken.push(chunk)
      active = false
    },
    () => active
  )
  expect(spoken).toHaveLength(1)
})
