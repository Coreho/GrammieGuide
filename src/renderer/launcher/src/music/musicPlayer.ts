import type { MusicPlaylist, MusicSettings } from '@shared/music/musicSchema'
import type { MusicTrack } from '@shared/music/musicTypes'
import {
  advanceMusicQueue,
  createMusicQueue,
  musicDeadline,
  musicExpired,
  type MusicQueue
} from '@shared/music/queue'
import { audioSnapshot, sendAudio, subscribeAudio } from '../../../audio/audioBridge'
import type { AudioDecision } from '@shared/audio/audioPolicy'

export interface MusicPlayerSnapshot {
  loading: boolean
  playlists: MusicPlaylist[]
  currentId: string | null
  currentLabel: string
  title: string
  state: AudioDecision['music']
  showChip: boolean
  unavailable: ReadonlySet<string>
}

/** One player per launcher renderer, independent of whether the Music view is open. */
class MusicPlayer {
  private audio = new Audio()
  private tracks = new Map<string, MusicTrack>()
  private settings: MusicSettings = { playlists: [], autoStopMinutes: 90, showNowPlayingChip: true }
  private queue: MusicQueue | null = null
  private current: MusicPlaylist | null = null
  private startedAt: number | null = null
  private deadline: number | null = null
  private timer: number | null = null
  private request = 0
  private generation = 0
  private connected = false
  private loading = true
  private unavailable = new Set<string>()
  private listeners = new Set<() => void>()
  private value: MusicPlayerSnapshot = {
    loading: true,
    playlists: [],
    currentId: null,
    currentLabel: '',
    title: '',
    state: 'off',
    showChip: true,
    unavailable: new Set()
  }
  private appliedState: AudioDecision['music'] = 'off'
  private reported = false
  private ready = false
  private playAttempt = 0
  private confirmedAttempt = -1
  private intent = 0

  snapshot = (): MusicPlayerSnapshot => this.value
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (!this.connected) this.connect()
    return () => {
      this.listeners.delete(listener)
    }
  }
  private connect(): void {
    this.connected = true
    this.audio.preload = 'auto'
    this.audio.hidden = true
    this.audio.dataset.musicPlayer = ''
    document.body.appendChild(this.audio)
    this.audio.onended = () => {
      if (this.ready && this.audio.ended) this.next()
    }
    this.audio.onerror = () => {
      if (this.ready && this.audio.error) this.failed()
    }
    subscribeAudio(() => this.applyDecision())
    window.launcher.onConfigChanged(() => {
      void this.refresh()
    })
    void window.launcher.resetAudioOwner().then(
      () => this.refresh(),
      () => this.refresh()
    )
  }
  private publish(): void {
    const track = this.queue ? this.tracks.get(this.queue.ids[this.queue.index]!) : undefined
    this.value = {
      loading: this.loading,
      playlists: this.settings.playlists,
      currentId: this.current?.id ?? null,
      currentLabel: this.current?.label ?? '',
      title: track?.title ?? '',
      state: this.current ? audioSnapshot().decision.music : 'off',
      showChip: this.settings.showNowPlayingChip,
      unavailable: new Set(this.unavailable)
    }
    for (const listener of this.listeners) listener()
  }
  private async refresh(): Promise<void> {
    const request = ++this.request
    try {
      const result = await window.launcher.getMusicPlaylists()
      if (request !== this.request) return
      const before = JSON.stringify(this.settings.playlists)
      this.settings = result.settings
      this.tracks = new Map(result.tracks.map((track) => [track.id, track]))
      if (before !== JSON.stringify(result.settings.playlists)) this.unavailable.clear()
      for (const list of result.settings.playlists) {
        if (!list.trackIds.some((id) => this.tracks.has(id))) this.unavailable.add(list.id)
      }
      this.loading = false
      if (this.current) {
        const configured = this.settings.playlists.find((list) => list.id === this.current!.id)
        if (!configured) {
          this.stop()
          return
        }
        const changed =
          JSON.stringify(this.current.trackIds) !== JSON.stringify(configured.trackIds) ||
          this.current.shuffle !== configured.shuffle
        const playingId = this.queue?.ids[this.queue.index]
        this.current = configured
        if (changed) {
          this.queue = createMusicQueue(configured.trackIds, configured.shuffle)
          const index = playingId ? this.queue.ids.indexOf(playingId) : -1
          this.queue.index = Math.max(0, index)
          if (index < 0) this.loadTrack()
        }
        if (this.startedAt !== null) {
          this.deadline = musicDeadline(this.startedAt, this.settings.autoStopMinutes)
          this.scheduleStop()
        }
        if (this.queue && !this.tracks.has(this.queue.ids[this.queue.index]!)) this.next()
      }
      this.publish()
    } catch {
      if (request !== this.request) return
      this.loading = false
      this.settings = { ...this.settings, playlists: [] }
      this.stop()
    }
  }
  async play(id: string): Promise<void> {
    this.intent++
    const playlist = this.settings.playlists.find((list) => list.id === id)
    if (!playlist || this.unavailable.has(id)) return
    if (this.current?.id === id) {
      if (audioSnapshot().decision.music === 'paused') await this.togglePause()
      return
    }
    const generation = ++this.generation
    this.ready = false
    this.audio.pause()
    this.current = playlist
    this.queue = createMusicQueue(playlist.trackIds, playlist.shuffle)
    this.reported = false
    this.startedAt = Date.now()
    this.deadline = musicDeadline(this.startedAt, this.settings.autoStopMinutes)
    this.scheduleStop()
    if (!this.queue.ids.length) {
      this.giveUp()
      return
    }
    try {
      await sendAudio({ type: 'musicPlay' })
    } catch {
      if (generation === this.generation) this.stop()
      return
    }
    if (generation !== this.generation || this.current?.id !== id) return
    this.loadTrack()
  }
  async togglePause(): Promise<void> {
    this.intent++
    if (!this.current) return
    const paused = audioSnapshot().decision.music === 'paused'
    try {
      await sendAudio({ type: paused ? 'musicPlay' : 'musicPause' })
    } catch {
      this.stop()
    }
  }
  /** Buddy confirms playback only after the actual media play promise succeeds. */
  async playAndConfirm(id: string): Promise<boolean> {
    const before = this.intent
    await this.refresh()
    // A delayed action must never undo her newer Stop, Pause or song choice.
    if (before !== this.intent) return false
    const start = this.play(id)
    const mine = this.intent
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (ok: boolean): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        off()
        resolve(ok)
      }
      const check = (): void => {
        if (mine !== this.intent || this.current?.id !== id) finish(false)
        else if (this.confirmedAttempt === this.playAttempt && !this.audio.paused) finish(true)
      }
      const off = this.subscribe(check)
      const timer = window.setTimeout(() => {
        finish(false)
        if (mine === this.intent && this.current?.id === id) this.stop()
      }, 10_000)
      void start.then(check, () => finish(false))
    })
  }
  stop(event: 'stop' | 'autostop' = 'stop'): void {
    this.intent++
    const id = this.current?.id
    this.generation++
    this.ready = false
    this.current = null
    this.queue = null
    this.startedAt = null
    this.deadline = null
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.appliedState = 'off'
    if (id && this.reported)
      void window.launcher.reportMusic({ event, playlistId: id }).catch(() => {})
    this.reported = false
    void sendAudio({ type: 'musicStop' }).catch(() => {})
    this.publish()
  }
  next(): void {
    this.intent++
    if (!this.queue || !this.current) return
    const next = advanceMusicQueue(this.queue)
    if (!next) {
      this.giveUp()
      return
    }
    this.queue = next
    this.loadTrack()
  }
  private failed(): void {
    if (!this.queue || !this.current) return
    const next = advanceMusicQueue(this.queue, true)
    if (!next) {
      this.giveUp()
      return
    }
    this.queue = next
    this.loadTrack()
  }
  private giveUp(): void {
    if (this.current) this.unavailable.add(this.current.id)
    this.stop()
  }
  private loadTrack(): void {
    if (!this.queue || !this.current) return
    this.generation++
    this.ready = false
    this.audio.pause()
    const track = this.tracks.get(this.queue.ids[this.queue.index]!)
    if (!track) {
      this.failed()
      return
    }
    this.audio.src = track.url
    this.audio.load()
    this.ready = true
    this.appliedState = 'off'
    this.applyDecision()
  }
  private applyDecision(): void {
    const decision = audioSnapshot().decision
    this.audio.volume = decision.musicVolume
    if (
      this.current &&
      this.ready &&
      (decision.music === 'playing' || decision.music === 'lowered')
    ) {
      if (this.appliedState !== 'playing' && this.appliedState !== 'lowered') {
        const generation = this.generation
        const attempt = ++this.playAttempt
        void this.audio.play().then(
          () => {
            if (generation !== this.generation || attempt !== this.playAttempt || !this.current)
              return
            this.confirmedAttempt = attempt
            if (this.queue) this.queue.failures = 0
            if (!this.reported) {
              this.reported = true
              void window.launcher
                .reportMusic({ event: 'play', playlistId: this.current.id })
                .catch(() => {})
            }
            this.publish()
          },
          () => {
            if (generation === this.generation && attempt === this.playAttempt) this.failed()
          }
        )
      }
    } else {
      // pause() rejects a pending play(). That is her choice or a quiet hold,
      // not evidence of a broken song; a later resume owns a new attempt.
      this.playAttempt++
      this.audio.pause()
    }
    this.appliedState = decision.music
    this.publish()
  }
  private scheduleStop(): void {
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
    if (this.deadline === null) return
    if (musicExpired(this.deadline, Date.now())) {
      this.stop('autostop')
      return
    }
    this.timer = window.setTimeout(() => this.stop('autostop'), this.deadline - Date.now())
  }
}

let player: MusicPlayer | undefined
export function getMusicPlayer(): MusicPlayer {
  return (player ??= new MusicPlayer())
}
