import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioCoordinator } from '../../src/main/services/audio/audioCoordinator'
import { RESUME_DELAY_MS, MUSIC_LOWERED_VOLUME } from '../../src/shared/audio/audioPolicy'

describe('runtime shared audio coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())
  it('lowers music under Buddy and resumes at the rule deadline without another event', () => {
    const audio = new AudioCoordinator()
    const update = vi.fn()
    audio.subscribe(update)
    audio.dispatch({ type: 'musicPlay' })
    expect(
      audio.dispatch({ type: 'start', source: 'buddyVoice', id: 'voice' }).decision
    ).toMatchObject({ music: 'lowered', musicVolume: MUSIC_LOWERED_VOLUME, muteWebPage: true })
    audio.dispatch({ type: 'end', id: 'voice' })
    vi.advanceTimersByTime(RESUME_DELAY_MS - 1)
    expect(audio.snapshot().decision.music).toBe('lowered')
    vi.advanceTimersByTime(1)
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ music: 'playing', musicVolume: 1 })
      })
    )
    audio.dispose()
  })
  it('keeps her own Pause after a hold ends and Stop clears pending resumption', () => {
    const audio = new AudioCoordinator()
    audio.dispatch({ type: 'musicPlay' })
    audio.dispatch({ type: 'start', source: 'chat', id: 'chat' })
    expect(audio.snapshot().decision.music).toBe('held')
    audio.dispatch({ type: 'musicPause' })
    audio.dispatch({ type: 'end', id: 'chat' })
    vi.advanceTimersByTime(RESUME_DELAY_MS * 2)
    expect(audio.snapshot().decision.music).toBe('paused')
    expect(audio.dispatch({ type: 'musicStop' }).decision.showStopMusic).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    audio.dispose()
  })
  it('stops the prior voice and refuses a new voice during listening', () => {
    const audio = new AudioCoordinator()
    audio.dispatch({ type: 'start', source: 'buddyVoice', id: 'first' })
    expect(audio.dispatch({ type: 'start', source: 'narration', id: 'second' }).stop).toEqual([
      'first'
    ])
    expect(audio.dispatch({ type: 'start', source: 'listening', id: 'mic' }).stop).toEqual([
      'second'
    ])
    expect(audio.dispatch({ type: 'start', source: 'buddyVoice', id: 'refused' }).stop).toEqual([
      'refused'
    ])
    audio.dispose()
  })
})
