import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhatsAppConnection } from '../../src/main/services/whatsapp/whatsAppConnection'
import type { WhatsAppSetupState } from '../../src/shared/whatsAppCalls'

function fixture(canConnect = (): boolean => true): {
  connection: WhatsAppConnection
  owner: BrowserWindow
  session: ConstructorParameters<typeof WhatsAppConnection>[0] & {
    prepare: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  fail: () => void
} {
  const owner = Object.assign(new EventEmitter(), {
    webContents: new EventEmitter(),
    isDestroyed: () => false
  }) as unknown as BrowserWindow
  let state: WhatsAppSetupState = { open: false, phase: 'closed' }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  const session = {
    callsOpen: false,
    locallyClosed: true,
    state: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    prepare: vi.fn(() => {
      session.callsOpen = true
      session.locallyClosed = false
      state = { open: false, phase: 'loading' }
      notify()
    }),
    close: vi.fn(() => {
      session.callsOpen = false
      session.locallyClosed = true
      state = { open: false, phase: 'closed' }
      notify()
      return state
    }),
    open: vi.fn(() => {
      state = { open: true, phase: 'loading' }
      notify()
      return state
    }),
    closeSetup: () => {
      if (!session.callsOpen) session.close()
      return state
    },
    dispose: vi.fn()
  }
  const connection = new WhatsAppConnection(session, canConnect)
  return {
    connection,
    owner,
    session,
    fail: () => {
      session.callsOpen = false
      session.locallyClosed = true
      state = { open: false, phase: 'unavailable' }
      notify()
    }
  }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('WhatsApp listening lifecycle', () => {
  it('recreates an idle peer after failed first load or crash without repeating a call', async () => {
    const f = fixture()
    f.session.prepare.mockImplementationOnce(f.fail)
    f.connection.prepare(f.owner)
    expect(f.session.callsOpen).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.session.callsOpen).toBe(true)
    expect(f.session.prepare).toHaveBeenCalledTimes(2)
    f.fail()
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.session.prepare).toHaveBeenCalledTimes(3)
    f.connection.dispose()
  })
  it('backs off repeated failures and cancels retries on explicit stop', async () => {
    const f = fixture()
    f.session.prepare.mockImplementation(f.fail)
    f.connection.prepare(f.owner)
    await vi.advanceTimersByTimeAsync(999)
    expect(f.session.prepare).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.session.prepare).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(f.session.prepare).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.session.prepare).toHaveBeenCalledTimes(3)
    f.connection.stop()
    await vi.advanceTimersByTimeAsync(120000)
    expect(f.session.prepare).toHaveBeenCalledTimes(3)
    f.connection.dispose()
  })
  it('suspends a requested listener for account setup and restores it when setup closes', () => {
    const f = fixture()
    f.connection.prepare(f.owner)
    f.connection.openSetup(f.owner)
    expect(f.session.callsOpen).toBe(false)
    expect(f.session.state().open).toBe(true)
    f.connection.closeSetup()
    expect(f.session.callsOpen).toBe(true)
    expect(f.session.prepare).toHaveBeenCalledTimes(2)
    f.connection.dispose()
  })
  it('restores listening after the setup window closes itself, but never creates unrequested listening', () => {
    const f = fixture()
    f.connection.openSetup(f.owner)
    f.session.close()
    expect(f.session.prepare).not.toHaveBeenCalled()
    f.connection.prepare(f.owner)
    f.connection.openSetup(f.owner)
    f.session.close()
    expect(f.session.callsOpen).toBe(true)
    expect(f.session.prepare).toHaveBeenCalledTimes(2)
    f.connection.dispose()
  })
  it('does not reopen after the Home owner crashes or reloads', async () => {
    const f = fixture()
    f.connection.prepare(f.owner)
    f.owner.webContents.emit('render-process-gone')
    await vi.advanceTimersByTimeAsync(120000)
    expect(f.session.callsOpen).toBe(false)
    expect(f.session.prepare).toHaveBeenCalledTimes(1)
    f.connection.prepare(f.owner)
    f.owner.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    await vi.advanceTimersByTimeAsync(120000)
    expect(f.session.prepare).toHaveBeenCalledTimes(2)
    expect(f.session.callsOpen).toBe(false)
    f.connection.dispose()
  })
  it('waits for call/pending teardown proof before replacing the peer', async () => {
    let allowed = false
    const f = fixture(() => allowed)
    f.connection.prepare(f.owner)
    await vi.advanceTimersByTimeAsync(120000)
    expect(f.session.prepare).not.toHaveBeenCalled()
    allowed = true
    f.connection.check()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.session.prepare).toHaveBeenCalledTimes(1)
    f.connection.dispose()
  })
})
