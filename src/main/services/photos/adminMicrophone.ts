import { session, type WebContents } from 'electron'
import { isAdminUnlocked } from '../auth/adminAuth'
import { getAdminWindow } from '../../windows/windowManager'

/** Default session belongs to our UI. Web tiles keep their separate deny-all session. */
export function installAdminMicrophonePermissions(): void {
  const trusted = (contents: WebContents | null, requestingUrl: string | undefined): boolean => {
    const admin = getAdminWindow()?.webContents
    if (!admin || contents !== admin || !requestingUrl || !isAdminUnlocked()) return false
    try {
      // Exact document, including path: a same-origin page or iframe is not the admin panel.
      const expected = new URL(admin.getURL())
      const requested = new URL(requestingUrl)
      return expected.href === requested.href && expected.pathname.endsWith('/admin/index.html')
    } catch {
      return false
    }
  }
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      permission === 'media' &&
      details.isMainFrame &&
      details.mediaType === 'audio' &&
      trusted(contents, details.requestingUrl)
  )
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      Boolean(
        permission === 'media' &&
        details.isMainFrame &&
        'mediaTypes' in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === 'audio' &&
        trusted(contents, details.requestingUrl)
      )
    )
  })
}
