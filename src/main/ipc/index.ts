import { registerConfigIpc } from './configIpc'
import { registerAdminIpc } from './adminIpc'
import { registerChatGptIpc } from './chatGptIpc'
import { registerReliabilityIpc } from './reliabilityIpc'
import { registerActivityIpc } from './activityIpc'
import { registerWeatherIpc } from './weatherIpc'
import { registerBrowserIpc } from './browserIpc'
import { registerBuddyIpc } from './buddyIpc'
import { registerNewsIpc } from './newsIpc'
import { registerTileIpc } from './tileIpc'
import { registerLibraryIpc } from './libraryIpc'
import { registerMusicIpc } from './musicIpc'
import { registerAudioIpc } from './audioIpc'
import { registerBackupIpc } from './backupIpc'
import { registerNarrationIpc } from './narrationIpc'
import { registerChecksIpc } from './checksIpc'
import { registerContactIpc } from './contactIpc'
import { registerWhatsAppIpc } from './whatsAppIpc'
import { registerKnittingIpc } from './knittingIpc'
import { isSafeMediaFileName } from '@shared/media/mediaPath'

/**
 * Composes every IPC domain into one registration call. Replaces the old
 * app's pattern of one 1154-line ipc.js registering ~40 handlers inline -
 * each domain gets its own module here instead.
 */
export function registerAllIpc(): void {
  registerWhatsAppIpc()
  registerAudioIpc()
  registerConfigIpc()
  registerAdminIpc()
  registerChatGptIpc()
  registerReliabilityIpc()
  registerActivityIpc()
  registerWeatherIpc()
  registerBrowserIpc()
  const getLibrary = registerLibraryIpc()
  registerContactIpc(async (id) => {
    if (!id) return undefined
    const entry = (await getLibrary('photos').list()).find((entry) => entry.id === id)
    const file = entry?.thumbFileName ?? entry?.fileName
    return file && isSafeMediaFileName(file) ? `grammie-media://photos/${file}` : undefined
  })
  registerKnittingIpc(async (id) => {
    if (!id) return undefined
    const entry = (await getLibrary('photos').list()).find((entry) => entry.id === id)
    if (!entry || !isSafeMediaFileName(entry.fileName)) return undefined
    const thumb =
      entry.thumbFileName && isSafeMediaFileName(entry.thumbFileName)
        ? entry.thumbFileName
        : entry.fileName
    return {
      url: `grammie-media://photos/${entry.fileName}`,
      thumbnailUrl: `grammie-media://photos/${thumb}`
    }
  })
  registerBuddyIpc(getLibrary)
  registerTileIpc()
  registerNewsIpc()
  registerMusicIpc(getLibrary)
  registerNarrationIpc(getLibrary)
  registerBackupIpc()
  registerChecksIpc()
}
