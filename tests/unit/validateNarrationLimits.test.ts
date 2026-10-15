import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('music-metadata', () => ({ parseBuffer: mocks.parse, TrackType: { video: 1 } }))
import { validateNarration } from '../../src/main/services/photos/validateNarration'
describe('narration duration and audio-only limits', () => {
  const format = { container: 'WAVE', codec: 'PCM', duration: 300, trackInfo: [] }
  beforeEach(() => mocks.parse.mockResolvedValue({ format }))
  it('accepts the five-minute boundary and streaming audio without a duration', async () => {
    await expect(validateNarration(Buffer.from('audio'), '.wav')).resolves.toBeUndefined()
    mocks.parse.mockResolvedValue({ format: { ...format, duration: undefined } })
    await expect(validateNarration(Buffer.from('stream'), '.webm')).resolves.toBeUndefined()
  })
  it.each([0, -1, 300.001, Infinity, NaN])('rejects duration %s', async (duration) => {
    mocks.parse.mockResolvedValue({ format: { ...format, duration } })
    await expect(validateNarration(Buffer.from('audio'), '.wav')).rejects.toThrow('five minutes')
  })
  it('rejects a video track hidden in an audio extension', async () => {
    mocks.parse.mockResolvedValue({ format: { ...format, trackInfo: [{ type: 1 }] } })
    await expect(validateNarration(Buffer.from('video'), '.webm')).rejects.toThrow('readable audio')
  })
})
