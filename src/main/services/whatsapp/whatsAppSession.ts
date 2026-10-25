import { BrowserWindow, WebContentsView, session, type Session, type WebContents } from 'electron'
import type { WhatsAppSetupState } from '@shared/whatsAppCalls'
import { whatsAppRuntime, type WhatsAppRuntimeRequest } from '@shared/whatsAppRuntime'

export const WHATSAPP_PARTITION = 'persist:whatsapp'
const WHATSAPP_URL = 'https://web.whatsapp.com/'
const HEADER_HEIGHT = 112
const SETUP_SHELL = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Link WhatsApp — GrammieGuide</title>
<style>body{margin:0;padding:16px 24px;background:#f7f4ec;color:#253735;font:18px system-ui}h1{font-size:25px;margin:0 0 6px}p{margin:0;max-width:960px}</style>
<h1>Link WhatsApp to GrammieGuide</h1><p>Use WhatsApp on your phone: Linked devices → Link a device. Scan the code below. Close this setup window when finished. Calling is not enabled during setup.</p>`)}`

function allowedNavigation(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === 'https://web.whatsapp.com' && !url.username && !url.password
  } catch {
    return false
  }
}

// Only structural sign-in status leaves the remote page. No chat text, contacts,
// account IDs, credentials or QR payloads are inspected or returned. These markers
// are setup diagnostics; observing them NEVER enables the calling capabilities.
const LINK_PROBE = `(() => {
  const visible = selector => {
    const node = document.querySelector(selector);
    return !!node && node.getClientRects().length > 0;
  };
  if (visible('#pane-side') || visible('[aria-label="Chat list"]')) return 'linked';
  if (visible('[data-ref] canvas') || visible('[data-testid="qrcode"]')) return 'link-required';
  return 'loading';
})()`

/** Real, isolated in-app linking surface. Creation is lazy: Home never waits for WhatsApp. */
export class EmbeddedWhatsAppSession {
  private current: WhatsAppSetupState = { open: false, phase: 'closed' }
  private readonly listeners = new Set<() => void>()
  private host: BrowserWindow | null = null
  private view: WebContentsView | null = null
  private webSession: Session | null = null
  private generation = 0
  private probeGeneration: number | null = null
  private probeAbort: AbortController | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  private cleanupParent: (() => void) | null = null
  private disposed = false
  private callMode = false
  private microphone = false
  private lastClosed: WebContents | null = null

  get callsOpen(): boolean {
    return this.callMode && !!this.view && !this.view.webContents.isDestroyed()
  }
  get generationId(): number {
    return this.generation
  }
  get locallyClosed(): boolean {
    return !this.view && (!this.lastClosed || this.lastClosed.isDestroyed())
  }
  allowMicrophone(allow: boolean): void {
    this.microphone = allow && this.callsOpen
  }
  prepare(parent: BrowserWindow): void {
    if (this.callsOpen || this.disposed) return
    this.close()
    this.open(parent, true)
  }
  closeSetup(): WhatsAppSetupState {
    return this.callMode ? this.state() : this.close()
  }
  async run(request: WhatsAppRuntimeRequest, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    const view = this.view
    if (!this.callsOpen || !view) throw new Error('Call session unavailable')
    // prepare() returns while Chromium is still navigating. Loading is neither
    // a working transport nor a failed call; keep it alive for the next probe.
    if (!allowedNavigation(view.webContents.getURL()))
      return { supported: false, idle: false, call: null }
    const generation = this.generation
    // User gesture is supplied only for a typed command originating at a trusted
    // GrammieGuide button. Neither remote content nor a renderer supplies code.
    const result: unknown = await view.webContents.executeJavaScript(
      `(${whatsAppRuntime.toString()})(${JSON.stringify(request)})`,
      request.type !== 'read'
    )
    signal.throwIfAborted()
    if (generation !== this.generation) throw new Error('Call session replaced')
    return result
  }

  state(): WhatsAppSetupState {
    return { ...this.current }
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private update(phase: WhatsAppSetupState['phase']): void {
    const open = this.host !== null && !this.callMode
    if (this.current.open === open && this.current.phase === phase) return
    this.current = { open, phase }
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* A closing caregiver window reads state next time. */
      }
    }
  }
  private getSession(): Session {
    if (this.webSession) return this.webSession
    const ses = session.fromPartition(WHATSAPP_PARTITION)
    // WhatsApp's supported-browser page rejects the app/Electron product tokens.
    // Retain the bundled Chromium's real version and platform instead of inventing
    // a Chrome version or sending her to update an unrelated installed browser.
    // This must happen before constructing the remote WebContents.
    ses.setUserAgent(ses.getUserAgent().replace(/\s(?:Electron|grammieguide)\/\S+/gi, ''))
    const owns = (contents: WebContents | null): boolean =>
      this.microphone &&
      this.callsOpen &&
      contents === this.view?.webContents &&
      !!contents &&
      allowedNavigation(contents.getURL())
    // A lease exists only after Start/Answer, for this exact main frame. Setup,
    // video, screens, subframes and other sessions never gain capture access.
    ses.setPermissionCheckHandler(
      (contents, permission, origin, details) =>
        owns(contents) &&
        permission === 'media' &&
        allowedNavigation(origin) &&
        details.isMainFrame === true &&
        details.mediaType === 'audio'
    )
    ses.setPermissionRequestHandler((contents, permission, callback, details) => {
      const media = ('mediaTypes' in details ? details.mediaTypes : []) ?? []
      callback(
        owns(contents) &&
          permission === 'media' &&
          details.isMainFrame === true &&
          allowedNavigation(details.requestingUrl) &&
          media.length === 1 &&
          media[0] === 'audio'
      )
    })
    ses.setDevicePermissionHandler(() => false)
    ses.setDisplayMediaRequestHandler(() => {})
    ses.on('will-download', (event) => event.preventDefault())
    this.webSession = ses
    return ses
  }

  open(parent: BrowserWindow | undefined, forCalls = false): WhatsAppSetupState {
    if (this.disposed) return this.state()
    if (this.callsOpen && !forCalls) throw new Error('Close calling before account setup')
    if (this.host && !this.host.isDestroyed()) {
      if (process.env.GRAMMIEGUIDE_E2E !== '1') this.host.focus()
      return this.state()
    }
    const generation = ++this.generation
    this.callMode = forCalls
    const quiet = process.env.GRAMMIEGUIDE_E2E === '1'
    // Establish the partition before allocating a window so a session failure
    // cannot leave an invisible, unowned setup window behind.
    const remoteSession = this.getSession()
    const host = new BrowserWindow({
      parent,
      width: 1120,
      height: 850,
      minWidth: 750,
      minHeight: 600,
      title: 'Link WhatsApp — GrammieGuide',
      autoHideMenuBar: true,
      show: false,
      ...(quiet ? { opacity: 0, skipTaskbar: true } : {}),
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    const view = new WebContentsView({
      webPreferences: {
        session: remoteSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        disableDialogs: true,
        navigateOnDragDrop: false,
        backgroundThrottling: false
      }
    })
    this.host = host
    this.view = view
    const remoteContents = view.webContents
    remoteContents.once('destroyed', () => {
      // close() may return before Chromium finishes destruction. Publish again
      // when the main process can positively establish the local peer is gone.
      if (this.lastClosed === remoteContents) for (const listener of this.listeners) listener()
    })
    host.contentView.addChildView(view)
    const layout = (): void => {
      if (host.isDestroyed()) return
      const [width = 0, height = 0] = host.getContentSize()
      view.setBounds({ x: 0, y: HEADER_HEIGHT, width, height: Math.max(0, height - HEADER_HEIGHT) })
    }
    host.on('resize', layout)
    host.once('closed', () => {
      if (generation === this.generation) this.close()
    })
    host.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    host.webContents.on('will-navigate', (event) => event.preventDefault())
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const guardNavigation = (event: { preventDefault: () => void }, url: string): void => {
      if (!allowedNavigation(url)) event.preventDefault()
    }
    view.webContents.on('will-navigate', guardNavigation)
    view.webContents.on('will-redirect', guardNavigation)
    view.webContents.on('dom-ready', () => {
      void this.probe(generation)
    })
    view.webContents.on('render-process-gone', () => {
      if (generation === this.generation) this.close('unavailable')
    })
    if (parent) {
      const close = (): void => {
        this.close()
      }
      const navigation = (details: { isMainFrame: boolean; isSameDocument: boolean }): void => {
        if (details.isMainFrame && !details.isSameDocument) close()
      }
      parent.once('closed', close)
      parent.webContents.once('destroyed', close)
      parent.webContents.on('render-process-gone', close)
      parent.webContents.on('did-start-navigation', navigation)
      this.cleanupParent = () => {
        parent.removeListener('closed', close)
        parent.webContents.removeListener('destroyed', close)
        parent.webContents.removeListener('render-process-gone', close)
        parent.webContents.removeListener('did-start-navigation', navigation)
      }
    }
    layout()
    this.update('loading')
    const failed = (): void => {
      if (generation === this.generation) this.close('unavailable')
    }
    void host.loadURL(SETUP_SHELL).catch(failed)
    void view.webContents
      .loadURL(WHATSAPP_URL)
      .then(() => this.probe(generation))
      .catch(failed)
    this.poll = setInterval(() => {
      void this.probe(generation)
    }, 1500)
    this.poll.unref()
    if (forCalls) {
      // Audio stays inside GrammieGuide; Grandma sees only the trusted controls.
      // Never show the account's chats or an independent provider call window.
    } else if (quiet) {
      host.setIgnoreMouseEvents(true)
      host.showInactive()
    } else host.show()
    return this.state()
  }

  private async probe(generation: number): Promise<void> {
    const view = this.view
    if (
      !view ||
      generation !== this.generation ||
      view.webContents.isDestroyed() ||
      this.probeGeneration === generation
    )
      return
    // Even if navigation guards fail, never inspect a different document.
    if (!allowedNavigation(view.webContents.getURL())) return
    this.probeGeneration = generation
    const abort = new AbortController()
    this.probeAbort = abort
    const timeout = setTimeout(() => abort.abort(), 5000)
    try {
      const phase: unknown = await Promise.race([
        view.webContents.executeJavaScriptInIsolatedWorld(1002, [{ code: LINK_PROBE }]),
        new Promise<never>((_resolve, reject) => {
          abort.signal.addEventListener('abort', () => reject(new Error('Setup probe cancelled')), {
            once: true
          })
        })
      ])
      if (generation !== this.generation) return
      this.update(
        phase === 'linked' || phase === 'link-required' || phase === 'loading'
          ? phase
          : 'unavailable'
      )
    } catch {
      if (generation === this.generation) this.update('unavailable')
    } finally {
      clearTimeout(timeout)
      if (this.probeGeneration === generation) {
        this.probeGeneration = null
        this.probeAbort = null
      }
    }
  }

  close(
    phase: WhatsAppSetupState['phase'] = this.current.phase === 'linked' ? 'linked' : 'closed'
  ): WhatsAppSetupState {
    ++this.generation
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    this.probeAbort?.abort()
    this.cleanupParent?.()
    this.cleanupParent = null
    const host = this.host
    const view = this.view
    this.host = null
    this.view = null
    this.microphone = false
    this.callMode = false
    if (view) {
      this.lastClosed = view.webContents
      if (host && !host.isDestroyed()) host.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
    }
    if (host && !host.isDestroyed()) host.close()
    this.update(phase)
    return this.state()
  }
  dispose(): void {
    this.disposed = true
    this.close()
    this.listeners.clear()
  }
}
