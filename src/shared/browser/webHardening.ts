/**
 * The embedded browser's always-on protections, as pure data so they can be
 * unit tested without Electron - the same split as urlPolicy.ts and
 * loadFailure.ts. embeddedBrowser.ts and webSession.ts only apply these; none of
 * the decisions live there.
 *
 * Why this is unit tested rather than end-to-end: a dialog Electron refuses to
 * show cannot be observed through Playwright. Chromium still raises the CDP
 * `Page.javascriptDialogOpening` event, Playwright then tries to dismiss a dialog
 * that does not exist, and the worker dies with "No dialog is showing". That
 * happens for `alert`/`confirm`/`prompt` and for a beforeunload prompt alike, so
 * no e2e test can assert the suppression itself. What e2e does cover is the
 * surrounding behaviour: browser-close.spec.ts drives a page whose beforeunload
 * asks to stay, and Home still closes it immediately.
 */
import type { WebPreferences } from 'electron'

/**
 * Dialogs are disabled outright rather than auto-answered. Auto-answering would
 * mean a page could keep re-prompting forever; refusing means her screen never
 * gains a modal she has no way to dismiss.
 */
export const WEB_VIEW_PREFERENCES = {
  disableDialogs: true
} as const satisfies Partial<WebPreferences>

/**
 * A page that sets `beforeunload` would otherwise put a "leave this page?" prompt
 * in front of her when she taps Home, and nothing would dismiss it. Always let
 * the navigation or close go ahead.
 */
export function shouldPreventUnload(): true {
  return true
}

/** Downloads never reach the disk; the session cancels and logs every one. */
export const DOWNLOAD_BLOCKED_EVENT = 'browser-download-blocked'

/**
 * Permissions a web tile may hold: none. She browses alone, so there is nobody
 * to answer a prompt, and a page that can ask for the camera can also hold a
 * modal over her screen.
 */
export function grantPermission(_permission: string): false {
  return false
}

/** Same for permission *checks*, which most web APIs run before requesting. */
export function grantPermissionCheck(): false {
  return false
}

/** Device access (navigator.hid/serial/usb) has its own gate, and it is shut too. */
export function grantDevicePermission(): false {
  return false
}
