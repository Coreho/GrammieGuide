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
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  reject: ((error: Error) => void) | null = null
  constructor() {
    PendingAudio.instance = this
  }
  play = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        this.reject = reject
      })
  )
  pause = vi.fn()
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
