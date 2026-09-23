import { describe, it, expect } from 'vitest'
import { isAllowedUrl } from '../../src/main/services/browser/urlPolicy'

describe('isAllowedUrl', () => {
  it.each(['https://example.com', 'http://example.com/path?q=1'])('allows %s', (url) => {
    expect(isAllowedUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ftp://example.com',
    'data:text/html,<script>alert(1)</script>',
    'not a url at all'
  ])('blocks %s', (url) => {
    expect(isAllowedUrl(url)).toBe(false)
  })
})
