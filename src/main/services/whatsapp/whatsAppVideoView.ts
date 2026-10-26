import { randomUUID } from 'node:crypto'
import { WebContentsView, type BrowserWindow, type Rectangle, type WebContents } from 'electron'
import { whatsAppVideoRuntime, type WhatsAppVideoRequest } from '@shared/whatsAppVideo'

/** One blank video document owned by the hidden call peer, attached inside Home. */
export class WhatsAppVideoView {
  private readonly name = `grammie-video-${randomUUID()}`
  private view: WebContentsView | null = null
  private bounds: Rectangle | null = null
  private attached = false
  private ready = false
  private closed = false
  private preparing: Promise<boolean> | null = null

  constructor(
    private readonly opener: WebContents,
    private readonly parent: BrowserWindow
  ) {}

  private async run(request: WhatsAppVideoRequest, gesture = false): Promise<boolean> {
    if (this.opener.isDestroyed()) return false
    try {
      return (
        (await this.opener.executeJavaScript(
          `(${whatsAppVideoRuntime.toString()})(${JSON.stringify(request)})`,
          gesture
        )) === true
      )
    } catch {
      return false
    }
  }

  prepare(): Promise<boolean> {
    if (this.closed || this.opener.isDestroyed() || this.parent.isDestroyed())
      return Promise.resolve(false)
    if (this.ready) return Promise.resolve(true)
    if (this.preparing) return this.preparing
    this.preparing = this.prepareOnce()
    return this.preparing
  }

  private async prepareOnce(): Promise<boolean> {
    let armed = true
    this.opener.setWindowOpenHandler((details) => {
      if (!armed || this.closed || details.url !== 'about:blank' || details.frameName !== this.name)
        return { action: 'deny' }
      armed = false
      return {
        action: 'allow',
        createWindow: (options) => {
          // Chromium supplies the opener-linked WebContents. Replacing it breaks
          // same-origin canvas access and Electron's window-open lifecycle.
          const view = new WebContentsView({
            webContents: (options as typeof options & { webContents?: WebContents }).webContents,
            webPreferences: {
              ...options.webPreferences,
              session: this.opener.session,
              preload: undefined,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              webviewTag: false,
              navigateOnDragDrop: false,
              disableDialogs: true,
              backgroundThrottling: false
            }
          })
          this.view = view
          view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
          const blocked = (event: { preventDefault: () => void }): void => {
            event.preventDefault()
            this.close()
          }
          view.webContents.on('will-navigate', blocked)
          view.webContents.on('will-redirect', blocked)
          view.webContents.on('render-process-gone', () => this.close())
          view.webContents.once('destroyed', () => this.close())
          return view.webContents
        }
      }
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const ok = await Promise.race([
        this.run({ type: 'prepare', name: this.name }, true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), 3000)
        })
      ])
      if (!ok || this.closed || !this.view || this.view.webContents.isDestroyed()) {
        this.close()
        return false
      }
      this.ready = true
      this.layout()
      return true
    } catch {
      this.close()
      return false
    } finally {
      armed = false
      if (timer) clearTimeout(timer)
      if (!this.opener.isDestroyed()) this.opener.setWindowOpenHandler(() => ({ action: 'deny' }))
    }
  }

  async sync(callId: string): Promise<boolean> {
    if (this.closed || !this.ready) return false
    const ok = await this.run({ type: 'sync', name: this.name, callId })
    if (!ok) this.close()
    return ok && !this.closed
  }

  setBounds(bounds: Rectangle | null): void {
    this.bounds = bounds
    this.layout()
  }

  private layout(): void {
    const view = this.view
    if (!view || this.parent.isDestroyed()) return
    if (!this.ready || !this.bounds || this.closed) {
      if (this.attached) this.parent.contentView.removeChildView(view)
      this.attached = false
      return
    }
    view.setBounds(this.bounds)
    if (!this.attached) this.parent.contentView.addChildView(view)
    this.attached = true
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.ready = false
    const view = this.view
    this.layout()
    this.view = null
    if (!this.opener.isDestroyed()) {
      this.opener.setWindowOpenHandler(() => ({ action: 'deny' }))
      void this.run({ type: 'close', name: this.name })
    }
    if (view && !view.webContents.isDestroyed())
      view.webContents.close({ waitForBeforeUnload: false })
  }
}
