import type { AudioCoordinator } from './audioCoordinator'

export interface PageAudioContents {
  id: number
  isDestroyed(): boolean
  isCurrentlyAudible(): boolean
  setAudioMuted(muted: boolean): void
  on(event: 'audio-state-changed', listener: (event: { audible: boolean }) => void): unknown
  on(event: 'destroyed', listener: () => void): unknown
  removeListener(
    event: 'audio-state-changed',
    listener: (event: { audible: boolean }) => void
  ): unknown
  removeListener(event: 'destroyed', listener: () => void): unknown
}

/** The browser session remains isolated; this controls only the current embedded page. */
export function wirePageAudio(contents: PageAudioContents, audio: AudioCoordinator): () => void {
  const id = `page:${contents.id}`
  let live = true
  let audible = false
  let muted: boolean | null = null
  const onAudio = (event: { audible: boolean }): void => {
    if (!live || audible === event.audible) return
    audible = event.audible
    audio.dispatch(audible ? { type: 'start', source: 'webPage', id } : { type: 'end', id })
  }
  const offDecision = audio.subscribe(({ decision }) => {
    if (!live || contents.isDestroyed() || decision.muteWebPage === muted) return
    muted = decision.muteWebPage
    contents.setAudioMuted(muted)
  })
  const close = (): void => {
    if (!live) return
    live = false
    offDecision()
    contents.removeListener('audio-state-changed', onAudio)
    contents.removeListener('destroyed', close)
    audio.dispatch({ type: 'end', id })
  }
  contents.on('audio-state-changed', onAudio)
  contents.on('destroyed', close)
  muted = audio.snapshot().decision.muteWebPage
  if (!contents.isDestroyed()) contents.setAudioMuted(muted)
  onAudio({ audible: contents.isCurrentlyAudible() })
  return close
}
