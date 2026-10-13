import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wirePageAudio } from '../../src/main/services/audio/pageAudio'
import { AudioCoordinator } from '../../src/main/services/audio/audioCoordinator'
import { RESUME_DELAY_MS } from '../../src/shared/audio/audioPolicy'

class Page extends EventEmitter {
  id = 7
  audible = false
  destroyed = false
  setAudioMuted = vi.fn()
  isDestroyed(): boolean {
    return this.destroyed
  }
  isCurrentlyAudible(): boolean {
    return this.audible
  }
  sound(value: boolean): void {
    this.audible = value
    this.emit('audio-state-changed', { audible: value })
  }
}
describe('embedded-page sound wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())
  it('holds music while audible, delays resumption after quiet, and ends its hold on close', () => {
    const page = new Page()
    const audio = new AudioCoordinator()
    const close = wirePageAudio(page, audio)
    audio.dispatch({ type: 'musicPlay' })
    page.sound(true)
    expect(audio.snapshot().decision.music).toBe('held')
    page.sound(false)
    vi.advanceTimersByTime(RESUME_DELAY_MS)
    expect(audio.snapshot().decision.music).toBe('playing')
    page.sound(true)
    close()
    close()
    vi.advanceTimersByTime(RESUME_DELAY_MS)
    expect(audio.snapshot().decision.music).toBe('playing')
    expect(page.listenerCount('audio-state-changed')).toBe(0)
    audio.dispose()
  })
  it('mutes and unmutes page sound according to Buddy voice and listening holds', () => {
    const page = new Page()
    const audio = new AudioCoordinator()
    const close = wirePageAudio(page, audio)
    expect(page.setAudioMuted).toHaveBeenLastCalledWith(false)
    audio.dispatch({ type: 'start', source: 'buddyVoice', id: 'voice' })
    expect(page.setAudioMuted).toHaveBeenLastCalledWith(true)
    audio.dispatch({ type: 'end', id: 'voice' })
    expect(page.setAudioMuted).toHaveBeenLastCalledWith(false)
    audio.dispatch({ type: 'start', source: 'listening', id: 'mic' })
    expect(page.setAudioMuted).toHaveBeenLastCalledWith(true)
    audio.dispatch({ type: 'end', id: 'mic' })
    expect(page.setAudioMuted).toHaveBeenLastCalledWith(false)
    page.destroyed = true
    page.emit('destroyed')
    expect(page.listenerCount('audio-state-changed')).toBe(0)
    audio.dispose()
    close()
  })
  it('does not restore obsolete music decisions after a synchronous player event', () => {
    const audio = new AudioCoordinator()
    audio.subscribe(({ decision }) => {
      if (decision.music === 'playing')
        audio.dispatch({ type: 'start', source: 'webPage', id: 'page' })
    })
    const listener = vi.fn()
    audio.subscribe(listener)
    expect(audio.dispatch({ type: 'musicPlay' }).decision.music).toBe('held')
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ decision: expect.objectContaining({ music: 'held' }) })
    )
    audio.dispose()
  })
})
