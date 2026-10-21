import { WebContentsView, BrowserWindow, ipcMain, net } from 'electron'
import { join } from 'path'
import {
  classifyLoadFailure,
  describeLoadFailure,
  type PageOutcome,
  type PageProblem
} from '@shared/browser/loadFailure'
import { logActivity } from '../activityLog/activityLog'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { isAllowedUrl } from './urlPolicy'
import { WEB_PARTITION, hardenWebSession } from './webSession'
import { WEB_VIEW_PREFERENCES, shouldPreventUnload } from '@shared/browser/webHardening'
import { wirePageAudio } from '../audio/pageAudio'
import { getAudioCoordinator } from '../audio/audioRuntime'
import { getConfig } from '../../config/store'
import { navigationAllowed, webHostname, type NavigationKind } from '@shared/browser/approvedSites'
import { blockedSites } from './blockedSites'
import {
  NO_VIDEO,
  supportsVideoControls,
  operateVideo,
  type VideoState
} from '@shared/browser/videoControls'

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
let stopPageAudio: (() => void) | null = null
let hostWindow: BrowserWindow | null = null
let lastActivityAt = Date.now()
let activityListenerRegistered = false
// A News story is her reading, not a caregiver-chosen site: while one is open,
// the logs say what happened but not where (the old app logged every URL).
let privateNavigation = false
let trustedPage: string | null = null
let returnToNewsTileId: string | null = null
let committedPage: string | null = null
let videoState: VideoState = { ...NO_VIDEO }
// Test fixtures exercise the same adapter without granting arbitrary production sites.
let testVideoUrl: string | null = null
export function setVideoFixtureForTests(url: string): void {
  if (process.env.GRAMMIEGUIDE_E2E === '1') testVideoUrl = url
}
function supportedVideo(): boolean {
  const url = view?.webContents.getURL() ?? ''
  return supportsVideoControls(url) || (testVideoUrl !== null && url === testVideoUrl)
}
function updateVideo(state: VideoState): void {
  const changed = JSON.stringify(videoState) !== JSON.stringify(state)
  videoState = state
  if (changed) {
    layout()
    hostWindow?.webContents.send('browser:video', state)
  }
}
export async function sendVideoCommand(command: unknown): Promise<boolean> {
  if (
    !view ||
    problem ||
    !supportedVideo() ||
    !videoState.available ||
    !['play', 'pause', 'rewind', 'fullscreen'].includes(command as string)
  )
    return false
  if (!navigationAllowed(view.webContents.getURL(), getConfig(), 'back', trustedPage)) return false
  lastActivityAt = Date.now()
  try {
    return (
      (await view.webContents.executeJavaScriptInIsolatedWorld(
        1001,
        [{ code: `(${operateVideo.toString()})(${JSON.stringify(command)})` }],
        true
      )) === true
    )
  } catch {
    return false
  }
}

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

/** Windows' online state, through the same e2e stand-in the recovery screen uses. */
export function deviceOnline(): boolean {
  return isDeviceOnline()
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
    ipcMain.on('browserView:activity', (event) => {
      if (event.sender === view?.webContents || event.sender === hostWindow?.webContents)
        lastActivityAt = Date.now()
    })
    ipcMain.on('browserView:videoState', (event, state: VideoState) => {
      if (event.sender !== view?.webContents || event.senderFrame !== view.webContents.mainFrame)
        return
      if (problem || !supportedVideo()) return updateVideo({ ...NO_VIDEO })
      if (
        !state ||
        ['available', 'paused', 'canRewind', 'fullscreen'].some(
          (key) => typeof state[key as keyof VideoState] !== 'boolean'
        )
      )
        return
      updateVideo({
        available: state.available,
        paused: state.paused,
        canRewind: state.canRewind,
        fullscreen: state.fullscreen
      })
    })
    activityListenerRegistered = true
  }
}

function layout(): void {
  if (!view || !hostWindow) return
  const [width = 0, height = 0] = hostWindow.getContentSize()
  const top = NAV_BAR_HEIGHT + (videoState.available ? 88 : 0)
  view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) })
}

export function openUrl(
  url: string,
  options: {
    privateNavigation?: boolean
    trustedInitialPage?: boolean
    returnToNewsTileId?: string
    onLoaded?: (outcome: PageOutcome) => void
  } = {}
): { ok: boolean; reason?: string } {
  if (!hostWindow) return { ok: false, reason: 'no host window' }
  if (!isAllowedUrl(url)) {
    logActivity(
      'browser-open-rejected',
      options.privateNavigation ? undefined : (webHostname(url) ?? undefined)
    )
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
        disableHtmlFullscreenWindowResize: true,
        // Its own session, so the deny-all rules in webSession.ts (and the ad
        // blocker) apply to web tiles without touching Home or admin.
        partition: WEB_PARTITION,
        // alert/confirm/prompt can never appear, so a page cannot loop dialogs
        // over her screen or block on an answer nobody is there to give.
        ...WEB_VIEW_PREFERENCES
      }
    })
    hostWindow.contentView.addChildView(view)
    stopPageAudio = wirePageAudio(view.webContents, getAudioCoordinator())
    layout()

    view.webContents.on('will-prevent-unload', (event) => {
      // A site's "leave this page?" prompt must never hold the page open.
      if (shouldPreventUnload()) event.preventDefault()
    })

    view.webContents.on('will-navigate', (event, targetUrl) => {
      if (!allowNavigation(targetUrl, 'navigate')) event.preventDefault()
    })
    view.webContents.on('will-frame-navigate', (event) => {
      if (event.isMainFrame && !allowNavigation(event.url, 'navigate')) event.preventDefault()
    })
    view.webContents.on('will-redirect', (event, targetUrl, _inPlace, isMainFrame) => {
      if (isMainFrame && !allowNavigation(targetUrl, 'redirect')) event.preventDefault()
    })
    view.webContents.on('did-navigate', (_event, targetUrl) => {
      committedPage = targetUrl
    })

    view.webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame) updateVideo({ ...NO_VIDEO })
      if (details.isMainFrame && !details.isSameDocument) navigationFailed = false
    })
    const enableVideo = (): void => {
      view?.webContents.send('browserView:videoEnabled', supportedVideo())
    }
    view.webContents.on('dom-ready', enableVideo)
    view.webContents.on('did-navigate-in-page', enableVideo)

    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || problem === 'blocked') return
        const kind = classifyLoadFailure(errorCode, isDeviceOnline())
        if (!kind) return
        navigationFailed = true
        failedUrl = validatedURL
        showProblem(kind)
        // Auto-retries fail the same way every few seconds; log each failure once.
        const detail = privateNavigation
          ? 'private page load failed'
          : describeLoadFailure(validatedURL, errorDescription)
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
      logActivity(
        'browser-popup-blocked',
        privateNavigation ? undefined : (webHostname(targetUrl) ?? undefined)
      )
      return { action: 'deny' }
    })
  }

  privateNavigation = Boolean(options.privateNavigation)
  trustedPage = options.trustedInitialPage ? url : null
  returnToNewsTileId = options.returnToNewsTileId ?? null
  resetProblem()
  if (!allowNavigation(url, 'open')) {
    options.onLoaded?.('failed')
    return { ok: true }
  }
  view.setVisible(true)
  // loadURL rejects on a failed load; did-fail-load below already owns what she
  // sees, so swallow it rather than leaving an unhandled rejection in main.
  const openedView = view
  const settled = (): PageOutcome =>
    view !== openedView ? 'pending' : navigationFailed || problem !== null ? 'failed' : 'loaded'
  view.webContents.loadURL(url).then(
    () => options.onLoaded?.(settled()),
    // A rejection without a recorded failure is a redirect or replaced load
    // (ERR_ABORTED), not a broken page: say nothing either way.
    () => options.onLoaded?.(settled() === 'failed' ? 'failed' : 'pending')
  )
  lastActivityAt = Date.now()
  logActivity('browser-open', privateNavigation ? undefined : url)
  return { ok: true }
}

/** For Buddy's confirmations, which wait for the page rather than creation of its view. */
export async function openUrlAndWait(url: string, timeoutMs = 20_000): Promise<PageOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('pending'), timeoutMs)
    const finish = (outcome: PageOutcome): void => {
      clearTimeout(timer)
      resolve(outcome)
    }
    try {
      // A failed load leaves Home's recovery screen up, exactly as after a tap.
      if (!openUrl(url, { privateNavigation: true, onLoaded: finish }).ok) finish('refused')
    } catch {
      finish('refused')
    }
  })
}

export function goBack(): void {
  const nav = view?.webContents.navigationHistory
  if (nav?.canGoBack()) {
    const entry = nav.getEntryAtIndex(nav.getActiveIndex() - 1)
    if (!entry || !allowNavigation(entry.url, 'back')) return
    nav.goBack()
    lastActivityAt = Date.now()
  } else if (returnToNewsTileId) {
    const tileId = returnToNewsTileId
    closeEmbeddedBrowser()
    hostWindow?.webContents.send('news:return-to-shelf', { tileId })
  }
}

/** Her "Try again": reload the page that failed. The page stays hidden until it loads. */
export function retryPage(): void {
  lastActivityAt = Date.now()
  reloadFailedPage()
}

/** Her "Back to the page" after a blocked link: the page underneath is still there. */
export function dismissBlocked(): void {
  if (problem !== 'blocked') return
  // A fresh tile may redirect before any page commits. There is no page to
  // reveal in that case, so Back must return Home instead of exposing a blank view.
  if (!committedPage) {
    closeEmbeddedBrowser()
    hostWindow?.webContents.send('browser:return-home', {})
  } else if (allowNavigation(committedPage, 'back')) clearProblem()
}

function reloadFailedPage(): void {
  if (!view || !failedUrl || problem === null || problem === 'blocked') return
  if (!allowNavigation(failedUrl, 'retry')) return
  navigationFailed = false
  view.webContents.loadURL(failedUrl).catch(() => undefined)
}

function allowNavigation(url: string, kind: NavigationKind): boolean {
  // Read current config for every decision, so an admin edit also affects an
  // already-open page. Private browsing controls logs, never site permissions.
  if (navigationAllowed(url, getConfig(), kind, trustedPage)) return true
  const domain = blockedSites.record(url)
  logActivity('browser-navigation-blocked', privateNavigation ? undefined : (domain ?? undefined))
  logReliabilityEvent({
    op: 'browser-escape-guard',
    ok: true,
    detail: privateNavigation || !domain ? 'blocked navigation' : `blocked: ${domain}`
  })
  navigationFailed = true
  showProblem('blocked')
  return false
}

function showProblem(kind: PageProblem): void {
  updateVideo({ ...NO_VIDEO })
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
  updateVideo({ ...NO_VIDEO })
  stopPageAudio?.()
  stopPageAudio = null
  const closingView = view
  view = null
  privateNavigation = false
  trustedPage = null
  returnToNewsTileId = null
  committedPage = null
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

/**
 * What Home's recovery screen is showing instead of the page, or null. The
 * caregiver's recovery check reads this; showProblem() hides the page view
 * whenever it is set.
 */
export function getPageProblem(): PageProblem | null {
  return problem
}

export function getIdleMs(): number {
  return Date.now() - lastActivityAt
}
