import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decideAudio, initialAudioState, audioStep } from '../../src/shared/audio/audioPolicy'

const bridge = vi.hoisted(() => ({ listener: null as (() => void) | null, decision: {} }))
vi.mock('../../src/renderer/audio/audioBridge', () => ({
  audioSnapshot: () => ({ decision: bridge.decision }),
  subscribeAudio: (listener: () => void) => {
    bridge.listener = listener
  },
  sendAudio: vi.fn(async () => ({ decision: bridge.decision }))
}))

class PendingAudio {
  static instance: PendingAudio
  hidden = false
  dataset = {}
  volume = 1
  src = ''
  preload = ''
  paused = true
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  reject: ((error: Error) => void) | null = null
  complete: (() => void) | null = null
  constructor() {
    PendingAudio.instance = this
  }
  play = vi.fn(() => {
    // Chromium clears paused when play() is requested, before playback succeeds.
    this.paused = false
    return new Promise<void>((resolve, reject) => {
      this.reject = reject
      this.complete = () => {
        this.paused = false
        resolve()
      }
    })
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  load = vi.fn()
  removeAttribute = vi.fn()
}

describe('music playback interrupted while starting', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    bridge.decision = decideAudio(initialAudioState, Date.now())
    vi.stubGlobal('Audio', PendingAudio)
    vi.stubGlobal('document', { body: { appendChild: vi.fn() } })
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      launcher: {
        onConfigChanged: vi.fn(),
        resetAudioOwner: vi.fn().mockResolvedValue({}),
        reportMusic: vi.fn().mockResolvedValue(true),
        getMusicPlaylists: vi.fn().mockResolvedValue({
          settings: {
            playlists: [{ id: 'list', label: 'Favorites', shuffle: false, trackIds: ['song'] }],
            autoStopMinutes: 90,
            showNowPlayingChip: true
          },
          tracks: [{ id: 'song', title: 'A song', url: 'grammie-media://music/song.wav' }]
        })
      }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('confirms Buddy’s music action only after actual playback, and refuses a stopped or timed-out start', async () => {
    const { getMusicPlayer } = await import('../../src/renderer/launcher/src/music/musicPlayer')
    const player = getMusicPlayer()
    player.subscribe(() => {})
    await vi.waitFor(() => expect(player.snapshot().loading).toBe(false))
    bridge.decision = decideAudio(
      audioStep(initialAudioState, { type: 'musicPlay' }, Date.now()).state,
      Date.now()
    )
    const settled = vi.fn()
    const confirmed = player.playAndConfirm('list').then(settled)
    await vi.waitFor(() => expect(PendingAudio.instance.play).toHaveBeenCalledOnce())
    expect(settled).not.toHaveBeenCalled()
    PendingAudio.instance.complete!()
    await confirmed
    expect(settled).toHaveBeenCalledExactlyOnceWith(true)
    bridge.decision = { ...bridge.decision, music: 'paused' }
    bridge.listener!()
    bridge.decision = { ...bridge.decision, music: 'playing' }
    bridge.listener!()
    const resumed = vi.fn()
    const resume = player.playAndConfirm('list').then(resumed)
    await vi.advanceTimersByTimeAsync(0)
    expect(resumed).not.toHaveBeenCalled()
    PendingAudio.instance.complete!()
    await resume
    expect(resumed).toHaveBeenCalledExactlyOnceWith(true)
    player.stop()
    const stopped = player.playAndConfirm('list')
    await vi.waitFor(() => expect(PendingAudio.instance.play).toHaveBeenCalledTimes(3))
    player.stop()
    expect(await stopped).toBe(false)
    const timedOut = player.playAndConfirm('list')
    await vi.waitFor(() => expect(PendingAudio.instance.play).toHaveBeenCalledTimes(4))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await timedOut).toBe(false)
    expect(player.snapshot().currentId).toBeNull()
    expect(PendingAudio.instance.paused).toBe(true)
  })
  it('does not undo Stop while Buddy is awaiting a library refresh', async () => {
    const { getMusicPlayer } = await import('../../src/renderer/launcher/src/music/musicPlayer')
    const player = getMusicPlayer()
    player.subscribe(() => {})
    await vi.waitFor(() => expect(player.snapshot().loading).toBe(false))
    const result = await window.launcher.getMusicPlaylists()
    let release!: (value: typeof result) => void
    vi.mocked(window.launcher.getMusicPlaylists).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const action = player.playAndConfirm('list')
    player.stop()
    release(result)
    // Do not await the old implementation's unresolved media promise.
    await vi.advanceTimersByTimeAsync(0)
    expect(player.snapshot().currentId).toBeNull()
    expect(PendingAudio.instance.play).not.toHaveBeenCalled()
    expect(await action).toBe(false)
  })
  it.each(['musicPause', 'listening'] as const)(
    'keeps a valid track after a %s interrupts its pending play',
    async (hold) => {
      const { getMusicPlayer } = await import('../../src/renderer/launcher/src/music/musicPlayer')
      const player = getMusicPlayer()
      player.subscribe(() => {})
      await vi.waitFor(() => expect(player.snapshot().loading).toBe(false))
      const playing = audioStep(initialAudioState, { type: 'musicPlay' }, Date.now()).state
      bridge.decision = decideAudio(playing, Date.now())
      await player.play('list')
      expect(PendingAudio.instance.play).toHaveBeenCalledOnce()
      const held = audioStep(
        playing,
        hold === 'musicPause' ? { type: hold } : { type: 'start', source: hold, id: 'mic' },
        Date.now()
      ).state
      bridge.decision = decideAudio(held, Date.now())
      bridge.listener!()
      PendingAudio.instance.reject!(new DOMException('Playback interrupted', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
      expect(player.snapshot().currentId).toBe('list')
      expect(player.snapshot().unavailable.size).toBe(0)
      expect(PendingAudio.instance.src).toBe('grammie-media://music/song.wav')
      player.stop()
    }
  )
})
