import type { BrowserWindow } from 'electron'
import type { EmbeddedWhatsAppSession } from './whatsAppSession'
import type { WhatsAppSetupState } from '@shared/whatsAppCalls'

type Session = Pick<
  EmbeddedWhatsAppSession,
  | 'callsOpen'
  | 'locallyClosed'
  | 'state'
  | 'subscribe'
  | 'prepare'
  | 'open'
  | 'close'
  | 'closeSetup'
  | 'dispose'
>
const RETRY_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const

/** Owns listening intent, not calls. Recovery creates an idle peer; it never repeats a command. */
export class WhatsAppConnection {
  private owner: BrowserWindow | null = null
  private suspended = false
  private changing = false
  private disposed = false
  private attempt = 0
  private linkedAt: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private cleanupOwner: (() => void) | null = null
  private readonly unsubscribe: () => void

  constructor(
    private readonly session: Session,
    private readonly canConnect: () => boolean = () => true
  ) {
    this.unsubscribe = session.subscribe(() => this.check())
  }
  private cancelRetry(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  private watch(owner: BrowserWindow): void {
    this.cleanupOwner?.()
    const stop = (): void => this.stop()
    const navigation = (details: { isMainFrame: boolean; isSameDocument: boolean }): void => {
      if (details.isMainFrame && !details.isSameDocument) stop()
    }
    owner.once('closed', stop)
    owner.webContents.once('destroyed', stop)
    owner.webContents.on('render-process-gone', stop)
    owner.webContents.on('did-start-navigation', navigation)
    this.cleanupOwner = () => {
      owner.removeListener('closed', stop)
      owner.webContents.removeListener('destroyed', stop)
      owner.webContents.removeListener('render-process-gone', stop)
      owner.webContents.removeListener('did-start-navigation', navigation)
    }
  }
  prepare(owner: BrowserWindow): void {
    if (this.disposed || owner.isDestroyed()) return
    if (this.owner !== owner) {
      this.owner = owner
      this.watch(owner)
    }
    this.cancelRetry()
    this.attempt = 0
    this.connect()
  }
  private connect(): void {
    if (
      !this.owner ||
      this.suspended ||
      this.disposed ||
      this.session.callsOpen ||
      !this.canConnect()
    )
      return
    if (this.owner.isDestroyed()) {
      this.stop()
      return
    }
    if (!this.session.locallyClosed) {
      this.check()
      return
    }
    this.changing = true
    try {
      this.session.prepare(this.owner)
    } catch {
      /* A failed allocation/load is retried as a connection, never as a call. */
    } finally {
      this.changing = false
    }
    this.check()
  }
  /** Also called when the controller finishes clearing a destroyed call/pending command. */
  check(): void {
    if (this.changing || this.disposed) return
    const phase = this.session.state()
    if (this.suspended) {
      if (phase.open) return
      this.suspended = false
      this.connect()
      return
    }
    if (!this.owner) return
    if (this.session.callsOpen) {
      this.cancelRetry()
      if (phase.phase === 'linked' && this.linkedAt === null) this.linkedAt = Date.now()
      return
    }
    if (this.linkedAt !== null) {
      if (Date.now() - this.linkedAt >= 30_000) this.attempt = 0
      this.linkedAt = null
    }
    if (!this.canConnect()) {
      this.cancelRetry()
      return
    }
    if (this.timer) return
    const delay = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)]
    this.timer = setTimeout(() => {
      this.timer = null
      ++this.attempt
      this.connect()
    }, delay)
    this.timer.unref()
  }
  openSetup(parent: BrowserWindow | undefined): WhatsAppSetupState {
    this.cancelRetry()
    this.suspended = true
    this.changing = true
    try {
      this.session.close()
      return this.session.open(parent)
    } finally {
      this.changing = false
      // A failed setup allocation must not permanently lose the previous listener.
      if (!this.session.state().open) {
        this.suspended = false
        this.connect()
      }
    }
  }
  closeSetup(): WhatsAppSetupState {
    this.changing = true
    try {
      this.session.closeSetup()
    } finally {
      this.changing = false
    }
    this.check()
    return this.session.state()
  }
  stop(): void {
    this.owner = null
    this.suspended = false
    this.linkedAt = null
    this.cancelRetry()
    this.cleanupOwner?.()
    this.cleanupOwner = null
    this.session.close()
  }
  dispose(): void {
    this.disposed = true
    this.stop()
    this.unsubscribe()
    this.session.dispose()
  }
}
