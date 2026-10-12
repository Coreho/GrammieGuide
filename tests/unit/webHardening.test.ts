import { describe, expect, it } from 'vitest'
import {
  DOWNLOAD_BLOCKED_EVENT,
  WEB_VIEW_PREFERENCES,
  grantDevicePermission,
  grantPermission,
  grantPermissionCheck,
  shouldPreventUnload
} from '@shared/browser/webHardening'

/**
 * These pin the deny-all baseline for the embedded browser (TASK-01). The e2e
 * suite proves permissions are denied and downloads are cancelled against a real
 * page; the dialog half cannot be covered there at all - see the note in
 * webHardening.ts - so it is pinned here instead.
 */
describe('webHardening', () => {
  it('disables page dialogs outright rather than auto-answering them', () => {
    expect(WEB_VIEW_PREFERENCES.disableDialogs).toBe(true)
  })

  it('always lets a leave-page prompt be prevented', () => {
    expect(shouldPreventUnload()).toBe(true)
  })

  it('denies every permission, including the ones a page could hold on screen', () => {
    for (const permission of [
      'notifications',
      'media',
      'geolocation',
      'clipboard-read',
      'openExternal',
      'display-capture',
      'pointerLock',
      'unknown'
    ]) {
      expect(grantPermission(permission)).toBe(false)
    }
    expect(grantPermissionCheck()).toBe(false)
    expect(grantDevicePermission()).toBe(false)
  })

  it('logs downloads under a stable name the caregiver can search for', () => {
    expect(DOWNLOAD_BLOCKED_EVENT).toBe('browser-download-blocked')
  })
})
