import { describe, it, expect } from 'vitest'
import { supportsVideoControls } from '../../src/shared/browser/videoControls'

describe('supported videos', () => {
  it('supports only individual YouTube videos over HTTPS', () => {
    for (const path of ['/watch?v=abc', '/shorts/abc', '/embed/abc'])
      expect(supportsVideoControls(`https://www.youtube.com${path}`)).toBe(true)
    for (const url of [
      'https://youtube.com/',
      'https://youtube.com/results?q=cat',
      'https://youtube.com.evil.test/watch?v=a',
      'http://youtube.com/watch?v=a',
      'garbage'
    ])
      expect(supportsVideoControls(url)).toBe(false)
  })
})
