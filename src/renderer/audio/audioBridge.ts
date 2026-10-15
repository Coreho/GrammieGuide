import { decideAudio, initialAudioState, type AudioSource } from '@shared/audio/audioPolicy'
import type { AudioUpdate, ClientAudioEvent } from '@shared/audio/audioContract'
import type { LauncherApi } from '../../preload/launcher'

let latest: AudioUpdate = { revision: -1, decision: decideAudio(initialAudioState, 0), stop: [] }
const listeners = new Set<() => void>()
const sounds = new Map<string, () => void>()
let connected = false
type AudioApi = Pick<LauncherApi, 'onAudioChanged' | 'getAudio' | 'audioEvent'>
const api = (): AudioApi => window.launcher ?? window.admin

function receive(update: AudioUpdate): void {
  if (update.revision < latest.revision) return
  latest = update
  for (const id of update.stop) sounds.get(id)?.()
  for (const listener of listeners) listener()
}

function connect(): void {
  if (connected) return
  connected = true
  api().onAudioChanged(receive)
  void api()
    .getAudio()
    .then(receive, () => {})
}

export function audioSnapshot(): AudioUpdate {
  return latest
}
export function subscribeAudio(listener: () => void): () => void {
  connect()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export async function sendAudio(event: ClientAudioEvent): Promise<AudioUpdate> {
  connect()
  const update = await api().audioEvent(event)
  receive(update)
  return update
}

/** Register the stop callback before invoking: a newer voice may cancel this one during IPC. */
export async function holdAudio(
  source: Exclude<AudioSource, 'webPage'>,
  stop?: () => void
): Promise<{
  allowed: boolean
  release: () => void
}> {
  connect()
  const id = crypto.randomUUID()
  let ended = false
  let canceled = false
  sounds.set(id, () => {
    canceled = true
    stop?.()
  })
  const release = (): void => {
    if (ended) return
    ended = true
    sounds.delete(id)
    void sendAudio({ type: 'end', id }).catch(() => {})
  }
  try {
    const result = await sendAudio({ type: 'start', source, id })
    return { allowed: !canceled && !result.stop.includes(id), release }
  } catch {
    release()
    // A coordination failure must not suppress her existing Buddy speech path.
    return { allowed: source !== 'narration' && Boolean(window.launcher), release }
  }
}
