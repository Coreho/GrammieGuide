import { describe, expect, it } from 'vitest'
import { parseByteRange } from '../../src/shared/media/byteRange'

describe('single byte ranges', () => {
  it('distinguishes an absent header, including empty files', () => {
    expect(parseByteRange(null, 100)).toBeNull()
    expect(parseByteRange(null, 0)).toBeNull()
  })

  it.each([
    ['bytes=0-0', 100, { start: 0, end: 0 }],
    ['bytes=10-19', 100, { start: 10, end: 19 }],
    ['bytes=90-', 100, { start: 90, end: 99 }],
    ['bytes=-10', 100, { start: 90, end: 99 }],
    ['bytes=-200', 100, { start: 0, end: 99 }],
    ['bytes=90-200', 100, { start: 90, end: 99 }],
    [' BYTES=0-1 ', 100, { start: 0, end: 1 }],
    ['bytes=0-', 1, { start: 0, end: 0 }]
  ])('parses %s for size %i', (header, size, expected) => {
    expect(parseByteRange(header, size)).toEqual(expected)
  })

  it.each([
    '',
    'bytes=-',
    'bytes=-0',
    'bytes=100-',
    'bytes=100-101',
    'bytes=20-10',
    'bytes=0-1,5-6',
    'items=0-1',
    'bytes=1.5-2',
    'bytes=+1-2',
    'bytes=1 -2',
    'bytes=9007199254740992-',
    'bytes=-9007199254740992',
    'bytes=0-9007199254740992'
  ])('rejects malformed, multiple or unsatisfiable range %s', (header) => {
    expect(parseByteRange(header, 100)).toBe('invalid')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects ranges for invalid/empty size %s',
    (size) => {
      expect(parseByteRange('bytes=0-', size)).toBe('invalid')
    }
  )
})
