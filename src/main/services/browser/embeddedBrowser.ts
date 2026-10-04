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
import { WEB_PARTITION, hardenWebSession } from './webSession'
import { WEB_VIEW_PREFERENCES, shouldPreventUnload } from '@shared/browser/webHardening'
import {
  hostFromUrl,
  isApprovedHost,
  matchesApprovedSite,
  rememberAttempt,
  tileHosts,
  type BlockedAttempt
} from '@shared/browser/approvedSites'
import { getConfig } from '../../config/store'

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

/**
 * Recent sites she was not allowed to reach, for the caregiver's Browsing tab.
 * In memory only, like the activity log: it is a "what did she try" list, not a
 * browsing history, and there is nothing here worth keeping across a restart.
 */
let blockedAttempts: BlockedAttempt[] = []

/**
 * The one host allowed regardless of the approved list, for the story page main
 * just served from a News feed. Consumed by that first navigation, so any link or
 * redirect *from* the story goes through the normal rules (TASK-21).
 */
let newsStoryHost: string | null = null

/**
 * The last page she was actually allowed to reach, so a blocked attempt can say
 * where she was coming from. A host, never an address: this ends up in admin.
 */
let lastAllowedUrl: string | null = null

export function getBlockedAttempts(): BlockedAttempt[] {
  return blockedAttempts.map((item) => ({ ...item }))
}

export function clearBlockedAttempt(host: string): void {
  blockedAttempts = blockedAttempts.filter((item) => item.host !== host)
}

/** The hosts she may currently reach: her tiles' own sites plus admin approvals. */
function approvedHosts(): string[] {
  const config = getConfig()
  return [...tileHosts(config.tiles), ...config.browser.approvedSites]
}

/**
 * Whether a main-frame navigation is allowed.
 *
 * Only the pages she *goes to* are checked. Images, scripts and frames a page pulls
 * from other domains are untouched, or every approved site would break the moment
 * it used a CDN.
 */
export function isNavigationAllowed(targetUrl: string): boolean {
  if (!isAllowedUrl(targetUrl)) return false
  const host = hostFromUrl(targetUrl)
  if (!host) return false
  if (newsStoryHost && matchesApprovedSite(host, newsStoryHost)) {
    // Consumed: only the story page main served is exempt.
    newsStoryHost = null
    return true
  }
  return isApprovedHost(host, approvedHosts())
}

/** E2E only: Chromium's offline emulation stalls loads instead of failing them. */
export function overrideOnlineCheckForTests(check: () => boolean): void {
  isDeviceOnline = check
}

export function initEmbeddedBrowser(win: BrowserWindow): void {
  hostWindow = win
  hardenWebSession()
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
        // Until TASK-31 this pointed at an ES module, which a sandboxed preload can't
        // load, so taps inside web pages never reset the idle timer.
        preload: join(__dirname, '../preload/browserView.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Its own session, so the deny-all rules in webSession.ts (and the ad
        // blocker) apply to web tiles without touching Home or admin.
        partition: WEB_PARTITION,
        // alert/confirm/prompt can never appear, so a page cannot loop dialogs
        // over her screen or block on an answer nobody is there to give.
        ...WEB_VIEW_PREFERENCES
      }
    })
    hostWindow.contentView.addChildView(view)
    layout()

    view.webContents.on('will-prevent-unload', (event) => {
      // A site's "leave this page?" prompt must never hold the page open.
      if (shouldPreventUnload()) event.preventDefault()
    })

    view.webContents.on('will-navigate', (event, targetUrl) => {
      if (isNavigationAllowed(targetUrl)) return
      event.preventDefault()
      // A News story is main's own doing: main fetched the feed and served this
      // address, so the log records the tile and never the article's address.
      logActivity('browser-navigation-blocked', privateNavigation ? undefined : targetUrl)
      const host = hostFromUrl(targetUrl)
      logReliabilityEvent({
        op: 'browser-escape-guard',
        ok: true,
        detail: privateNavigation
          ? 'blocked navigation'
          : `blocked: ${host ?? 'unrecognised address'}`
      })
      hostWindow?.webContents.send('browser:blocked', { url: targetUrl })
      // Only an unapproved site is something she could act on, so only that one
      // is worth showing the caregiver with an "Approve this site" button. A
      // disallowed protocol (a mailto: link) has nothing to approve.
      if (isAllowedUrl(targetUrl) && host) {
        const from = hostFromUrl(lastAllowedUrl ?? '')
        blockedAttempts = rememberAttempt(blockedAttempts, { id: host, host, from }, Date.now())
        hostWindow?.webContents.send('browser:blocked-attempt', { host, from })
      }
      // A tap that silently does nothing is confusing; say why, on the same screen.
      showProblem('blocked')
    })

    view.webContents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      navigationFailed = false
      if (isAllowedUrl(details.url)) lastAllowedUrl = details.url
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
  // A News story is the one page main serves that is not on the approved list. The
  // exception covers that first navigation only, so any link or redirect from the
  // article goes through the normal rules.
  newsStoryHost = options.privateNavigation ? (hostFromUrl(url) ?? null) : null
  lastAllowedUrl = isNavigationAllowed(url) ? url : lastAllowedUrl
  resetProblem()
  view.setVisible(true)
  // loadURL rejects on a failed load; did-fail-load below already owns what she
  // sees, so swallow it rather than leaving an unhandled rejection in main.
  view.webContents.loadURL(url).catch(() => undefined)
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
  view.webContents.loadURL(failedUrl).catch(() => undefined)
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
