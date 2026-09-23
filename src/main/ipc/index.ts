import { registerConfigIpc } from './configIpc'
import { registerAdminIpc } from './adminIpc'
import { registerReliabilityIpc } from './reliabilityIpc'
import { registerActivityIpc } from './activityIpc'
import { registerWeatherIpc } from './weatherIpc'
import { registerBrowserIpc } from './browserIpc'

/**
 * Composes every IPC domain into one registration call. Replaces the old
 * app's pattern of one 1154-line ipc.js registering ~40 handlers inline -
 * each domain gets its own module here instead.
 */
export function registerAllIpc(): void {
  registerConfigIpc()
  registerAdminIpc()
  registerReliabilityIpc()
  registerActivityIpc()
  registerWeatherIpc()
  registerBrowserIpc()
}
