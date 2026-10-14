import { registerConfigIpc } from './configIpc'
import { registerAdminIpc } from './adminIpc'
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

/**
 * Composes every IPC domain into one registration call. Replaces the old
 * app's pattern of one 1154-line ipc.js registering ~40 handlers inline -
 * each domain gets its own module here instead.
 */
export function registerAllIpc(): void {
  registerAudioIpc()
  registerConfigIpc()
  registerAdminIpc()
  registerReliabilityIpc()
  registerActivityIpc()
  registerWeatherIpc()
  registerBrowserIpc()
  const getLibrary = registerLibraryIpc()
  registerBuddyIpc(getLibrary)
  registerTileIpc()
  registerNewsIpc()
  registerMusicIpc(getLibrary)
  registerNarrationIpc(getLibrary)
  registerBackupIpc()
}
