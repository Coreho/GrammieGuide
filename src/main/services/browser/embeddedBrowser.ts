import { WebContentsView, BrowserWindow, ipcMain, net } from 'electron'
import { join } from 'path'
import {
  classifyLoadFailure,
  describeLoadFailure,
  type PageProblem
} from '@shared/browser/loadFailure'
import { logActivity } from '../activityLog/activityLog'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { isAllowedUrl } from './urlPolicy'

/**
 * Embedded web-tile browser. Ports the escape-guard/popup-block logic from
 * the old app's ipc.js openEmbeddedBrowser() (protocol allow-list,
 * will-navigate/setWindowOpenHandler guards) - that logic was called out as
 * sound in the research pass and is reused near-verbatim here, just typed,
 * moved out of the ipc.js monolith into its own service, and built on
 * WebContentsView instead of the now-deprecated BrowserView.
 */

const NAV_BAR_HEIGHT = 72
/** While offline, how often to check whether the connection is back and retry. */
const OFFLINE_RETRY_MS = 5_000

let view: WebContentsView | null = null
let hostWindow: BrowserWindow | null = null
let lastActivityAt = Date.now()
let activityListenerRegistered = false
// A News story is her reading, not a caregiver-chosen site: while one is open,
// the logs say what happened but not where (the old app logged every URL).
let privateNavigation = false

// The recovery screen: which problem Home is showing instead of the page, the
// address to retry, and whether the current navigation has already failed.
let problem: PageProblem | null = null
let failedUrl: string | null = null
let navigationFailed = false
let lastLoggedFailure: string | null = null
let offlineRetryTimer: NodeJS.Timeout | null = null
let isDeviceOnline = (): boolean => net.isOnline()

/** E2E only: Chromium's offline emulation stalls loads instead of failing them. */
export function overrideOnlineCheckForTests(check: () => boolean): void {
  isDeviceOnline = check
}

export function initEmbeddedBrowser(win: BrowserWindow): void {
  hostWindow = win
  win.on('resize', () => layout())
  win.once('closed', () => {
    closeEmbeddedBrowser()
    hostWindow = null
  })

  if (!activityListenerRegistered) {
    ipcMain.on('browserView:activity', () => {
      lastActivityAt = Date.now()
    })
    activityListenerRegistered = true
  }
}

function layout(): void {
  if (!view || !hostWindow) return
  const [width = 0, height = 0] = hostWindow.getContentSize()
  view.setBounds({ x: 0, y: NAV_BAR_HEIGHT, width, height: Math.max(0, height - NAV_BAR_HEIGHT) })
}

export function openUrl(
  url: string,
  options: { privateNavigation?: boolean } = {}
): { ok: boolean; reason?: string } {
  if (!hostWindow) return { ok: false, reason: 'no host window' }
  if (!isAllowedUrl(url)) {
    logActivity('browser-open-rejected', options.privateNavigation ? undefined : url)
    return { ok: false, reason: 'only http/https URLs are allowed' }
  }

  if (!view) {
    view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/browserView.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    hostWindow.contentView.addChildView(view)
    layout()

    view.webContents.on('will-navigate', (event, targetUrl) => {
      if (!isAllowedUrl(targetUrl)) {
        event.preventDefault()
        logActivity('browser-navigation-blocked', privateNavigation ? undefined : targetUrl)
        logReliabilityEvent({
          op: 'browser-escape-guard',
          ok: true,
          detail: privateNavigation ? 'blocked navigation' : `blocked: ${targetUrl}`
        })
        hostWindow?.webContents.send('browser:blocked', { url: targetUrl })
        // A tap that silently does nothing is confusing; say why, on the same screen.
        showProblem('blocked')
      }
    })

    view.webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) navigationFailed = false
    })

    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return
        const kind = classifyLoadFailure(errorCode, isDeviceOnline())
        if (!kind) return
        navigationFailed = true
        failedUrl = validatedURL
        showProblem(kind)
        // Auto-retries fail the same way every few seconds; log each failure once.
        const detail = describeLoadFailure(validatedURL, errorDescription)
        if (detail !== lastLoggedFailure) {
          logActivity('browser-load-failed', detail)
          lastLoggedFailure = detail
        }
        if (kind === 'offline') scheduleOfflineRetry()
      }
    )

    view.webContents.on('did-finish-load', () => {
      // A blocked tap leaves the page itself fine; only she dismisses that screen.
      if (navigationFailed || problem === null || problem === 'blocked') return
      clearProblem()
    })

    view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      logActivity('browser-popup-blocked', privateNavigation ? undefined : targetUrl)
      return { action: 'deny' }
    })
  }

  privateNavigation = Boolean(options.privateNavigation)
  resetProblem()
  view.setVisible(true)
  view.webContents.loadURL(url)
  lastActivityAt = Date.now()
  logActivity('browser-open', privateNavigation ? undefined : url)
  return { ok: true }
}

export function goBack(): void {
  const nav = view?.webContents.navigationHistory
  if (nav?.canGoBack()) {
    nav.goBack()
    lastActivityAt = Date.now()
  }
}

/** Her "Try again": reload the page that failed. The page stays hidden until it loads. */
export function retryPage(): void {
  lastActivityAt = Date.now()
  reloadFailedPage()
}

/** Her "Back to the page" after a blocked link: the page underneath is still there. */
export function dismissBlocked(): void {
  if (problem === 'blocked') clearProblem()
}

function reloadFailedPage(): void {
  if (!view || !failedUrl || problem === null || problem === 'blocked') return
  navigationFailed = false
  view.webContents.loadURL(failedUrl)
}

function showProblem(kind: PageProblem): void {
  problem = kind
  // The page is a native view drawn over Home; hide it so Home's screen shows.
  view?.setVisible(false)
  hostWindow?.webContents.send('browser:page-problem', { kind })
}

function clearProblem(): void {
  resetProblem()
  view?.setVisible(true)
  hostWindow?.webContents.send('browser:page-problem', { kind: null })
}

function resetProblem(): void {
  if (offlineRetryTimer) clearTimeout(offlineRetryTimer)
  offlineRetryTimer = null
  problem = null
  failedUrl = null
  navigationFailed = false
  lastLoggedFailure = null
}

function scheduleOfflineRetry(): void {
  if (offlineRetryTimer) clearTimeout(offlineRetryTimer)
  offlineRetryTimer = setTimeout(() => {
    offlineRetryTimer = null
    if (problem !== 'offline') return
    // Retry only once Windows reports a connection, and without counting it as her
    // activity: an unattended offline page must still close after the idle timeout.
    if (isDeviceOnline()) reloadFailedPage()
    else scheduleOfflineRetry()
  }, OFFLINE_RETRY_MS)
}

export function closeEmbeddedBrowser(): void {
  const closingView = view
  view = null
  privateNavigation = false
  resetProblem()
  if (!closingView) return

  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.contentView.removeChildView(closingView)
  }
  // Removing the view only hides it; close the page so sound and its renderer stop.
  // A site's beforeunload handler must never keep it alive after she leaves.
  if (!closingView.webContents.isDestroyed()) {
    closingView.webContents.close({ waitForBeforeUnload: false })
  }
}

export function isBrowserOpen(): boolean {
  return view !== null
}

export function getIdleMs(): number {
  return Date.now() - lastActivityAt
}
