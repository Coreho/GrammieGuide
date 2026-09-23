import { WebContentsView, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
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

let view: WebContentsView | null = null
let hostWindow: BrowserWindow | null = null
let lastActivityAt = Date.now()
let activityListenerRegistered = false

export function initEmbeddedBrowser(win: BrowserWindow): void {
  hostWindow = win
  win.on('resize', () => layout())

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

export function openUrl(url: string): { ok: boolean; reason?: string } {
  if (!hostWindow) return { ok: false, reason: 'no host window' }
  if (!isAllowedUrl(url)) {
    logActivity('browser-open-rejected', url)
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
        logActivity('browser-navigation-blocked', targetUrl)
        logReliabilityEvent({ op: 'browser-escape-guard', ok: true, detail: `blocked: ${targetUrl}` })
        hostWindow?.webContents.send('browser:blocked', { url: targetUrl })
      }
    })

    view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      logActivity('browser-popup-blocked', targetUrl)
      return { action: 'deny' }
    })
  }

  view.webContents.loadURL(url)
  lastActivityAt = Date.now()
  logActivity('browser-open', url)
  return { ok: true }
}

export function goBack(): void {
  const nav = view?.webContents.navigationHistory
  if (nav?.canGoBack()) {
    nav.goBack()
    lastActivityAt = Date.now()
  }
}

export function closeEmbeddedBrowser(): void {
  if (view && hostWindow) {
    hostWindow.contentView.removeChildView(view)
  }
  view = null
}

export function isBrowserOpen(): boolean {
  return view !== null
}

export function getIdleMs(): number {
  return Date.now() - lastActivityAt
}
