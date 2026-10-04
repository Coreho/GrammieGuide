import { session } from 'electron'
import {
  DOWNLOAD_BLOCKED_EVENT,
  grantDevicePermission,
  grantPermission,
  grantPermissionCheck
} from '@shared/browser/webHardening'
import { logActivity } from '../activityLog/activityLog'

/**
 * The embedded browser runs in its own persistent session, separate from the
 * launcher and admin windows. Two reasons, both about trust:
 *
 *  - Everything a web tile does is confined here. The deny-all rules below
 *    cannot affect Home or the caregiver panel, which keep the default session.
 *  - The ad blocker (TASK-03) and the approved-sites rules attach to this one
 *    session, so those policies never leak into the app's own windows.
 *
 * `persist:` is what makes site logins survive an app restart. Moving off the
 * default session signs her out of websites once, which is expected. The
 * decisions themselves live in shared/browser/webHardening.ts so they can be
 * unit tested; this file only wires them to Electron.
 */
export const WEB_PARTITION = 'persist:web'

let hardened = false

export function hardenWebSession(): void {
  if (hardened) return
  hardened = true
  const ses = session.fromPartition(WEB_PARTITION)

  // Both handlers are needed: most web APIs check first and only then request,
  // so denying just one of the two still lets a page through. `openExternal` is
  // one of the permission strings, so this also stops a page handing an address
  // to the system browser or another app.
  ses.setPermissionCheckHandler(grantPermissionCheck)
  ses.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(grantPermission(permission))
  )
  ses.setDevicePermissionHandler(grantDevicePermission)
  // Screen capture: never answer, which denies it. (Passing null would restore
  // the default, so the handler has to stay installed.)
  ses.setDisplayMediaRequestHandler(() => undefined)

  // Nothing reaches the disk. No save path is chosen, so the download dies here.
  ses.on('will-download', (event) => {
    event.preventDefault()
    logActivity(DOWNLOAD_BLOCKED_EVENT)
  })
}
