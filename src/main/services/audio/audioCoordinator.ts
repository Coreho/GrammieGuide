import {
  audioStep,
  decideAudio,
  initialAudioState,
  type AudioEvent,
  type AudioState
} from '@shared/audio/audioPolicy'
import type { AudioUpdate } from '@shared/audio/audioContract'

export interface AudioClock {
  now(): number
  setTimeout(callback: () => void, delay: number): unknown
  clearTimeout(handle: unknown): void
}
const clock: AudioClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
}

/** One real-time owner of the existing pure rule, including its delayed resumption. */
export class AudioCoordinator {
  private state: AudioState = initialAudioState
  private timer: unknown = null
  private listeners = new Set<(update: AudioUpdate) => void>()
  private revision = 0
  constructor(private readonly time: AudioClock = clock) {}

  snapshot(): AudioUpdate {
    return { revision: this.revision, decision: decideAudio(this.state, this.time.now()), stop: [] }
  }
  subscribe(listener: (update: AudioUpdate) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  dispatch(event: AudioEvent): AudioUpdate {
    const result = audioStep(this.state, event, this.time.now())
    this.state = result.state
    return this.publish(result.stop)
  }
  private publish(stop: string[]): AudioUpdate {
    this.revision++
    if (this.timer !== null) this.time.clearTimeout(this.timer)
    this.timer = null
    const update = { ...this.snapshot(), stop }
    if (update.decision.changesAt !== null) {
      this.timer = this.time.setTimeout(
        () => {
          this.timer = null
          this.publish([])
        },
        Math.max(0, update.decision.changesAt - this.time.now())
      )
    }
    const revision = this.revision
    for (const listener of this.listeners) {
      listener(update)
      // A real player can synchronously emit another event while we mute it.
      // Do not publish the obsolete decision after the newer one.
      if (this.revision !== revision) break
    }
    return { ...this.snapshot(), stop }
  }
  dispose(): void {
    if (this.timer !== null) this.time.clearTimeout(this.timer)
    this.timer = null
    this.listeners.clear()
  }
}
