import { BrowserWindow, type WebContents } from 'electron'
import type { ClientAudioEvent, AudioUpdate } from '@shared/audio/audioContract'
import { AudioCoordinator } from './audioCoordinator'

let coordinator: AudioCoordinator | undefined
const owners = new Map<string, number>()
const watched = new Set<number>()
let musicOwner: number | null = null

export function getAudioCoordinator(): AudioCoordinator {
  if (!coordinator) {
    coordinator = new AudioCoordinator()
    coordinator.subscribe((update) => {
      for (const id of update.stop) owners.delete(id)
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.webContents.isDestroyed()) {
          // A crashing renderer may disappear between enumerating and sending.
          try {
            window.webContents.send('audio:changed', update)
          } catch {
            /* Next load reads a snapshot. */
          }
        }
      }
    })
  }
  return coordinator
}

export function clearAudioOwner(id: number): AudioUpdate {
  const audio = getAudioCoordinator()
  for (const [hold, owner] of owners) {
    if (owner !== id) continue
    owners.delete(hold)
    audio.dispatch({ type: 'end', id: hold })
  }
  if (musicOwner === id) {
    musicOwner = null
    audio.dispatch({ type: 'musicStop' })
  }
  return audio.snapshot()
}

/** Renderer recovery ends that renderer's sounds; a crashed voice cannot hold music forever. */
function watch(contents: WebContents): void {
  const id = contents.id
  if (watched.has(id)) return
  watched.add(id)
  // Reload replaces the document without destroying its WebContents. Its old
  // players are gone just as surely as on a crash, including admin previews.
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) clearAudioOwner(id)
  })
  contents.on('render-process-gone', () => clearAudioOwner(id))
  contents.once('destroyed', () => {
    clearAudioOwner(id)
    watched.delete(id)
  })
}

export function dispatchClientAudio(contents: WebContents, event: ClientAudioEvent): AudioUpdate {
  watch(contents)
  const audio = getAudioCoordinator()
  if (event.type === 'start') {
    const owner = owners.get(event.id)
    if (owner !== undefined && owner !== contents.id) throw new Error('Invalid audio source')
    owners.set(event.id, contents.id)
  } else if (event.type === 'end') {
    if (owners.get(event.id) !== contents.id) return audio.snapshot()
    owners.delete(event.id)
  } else if (event.type === 'musicPlay') musicOwner = contents.id
  else if (event.type === 'musicStop') musicOwner = null
  return audio.dispatch(event)
}
