import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ContactPerson } from '@shared/contactSettings'
import type { WhatsAppCallState } from '@shared/whatsAppCalls'
import { whatsAppVideoBoundsSchema } from '@shared/whatsAppCalls'
import { getConfig } from '../config/store'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { isAdminUnlocked, onAdminLocked } from '../services/auth/adminAuth'
import { WhatsAppController } from '../services/whatsapp/whatsAppController'
import type { WhatsAppAdapter } from '../services/whatsapp/whatsAppAdapter'
import { EmbeddedWhatsAppSession } from '../services/whatsapp/whatsAppSession'
import { createWhatsAppSessionAdapter } from '../services/whatsapp/whatsAppSessionAdapter'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getAudioCoordinator } from '../services/audio/audioRuntime'
import { WhatsAppConnection } from '../services/whatsapp/whatsAppConnection'

function requireControlWindow(event: IpcMainInvokeEvent): void {
  if (event.senderFrame !== event.sender.mainFrame) throw new Error('GrammieGuide window required')
  if (event.sender === getLauncherWindow()?.webContents) return
  if (event.sender === getAdminWindow()?.webContents) {
    requireAdminUnlocked()
    return
  }
  throw new Error('GrammieGuide window required')
}

function push(state: WhatsAppCallState): void {
  const targets = [getLauncherWindow(), ...(isAdminUnlocked() ? [getAdminWindow()] : [])]
  for (const target of targets) {
    if (!target || target.webContents.isDestroyed()) continue
    try {
      target.webContents.send('whatsapp:changed', state)
    } catch {
      /* A reloaded window reads state. */
    }
  }
}

/** No renderer can supply a URL, phone, provider token, or transport implementation. */
export function registerWhatsAppIpc(adapter?: WhatsAppAdapter): void {
  const setup = new EmbeddedWhatsAppSession()
  const stopSetupUpdates = setup.subscribe(() => {
    const admin = getAdminWindow()?.webContents
    if (!isAdminUnlocked() || !admin || admin.isDestroyed()) return
    try {
      admin.send('whatsapp:setupChanged', setup.state())
    } catch {
      /* A reloaded panel reads state. */
    }
  })
  // The session reports every second while WhatsApp is open, which is always
  // when a Family calls tile exists. Only real changes go out; otherwise the
  // audio coordinator rebroadcast and Home re-rendered every second for nothing.
  let holdingAudio = false
  let lastPushed = ''
  const controller = new WhatsAppController(
    adapter ?? createWhatsAppSessionAdapter(setup),
    () => {
      const { preferred, fallback } = getConfig().contacts
      return [preferred, fallback].filter((person): person is ContactPerson => person !== null)
    },
    (state) => {
      const inCall = Boolean(state.call || state.pending)
      if (inCall !== holdingAudio) {
        holdingAudio = inCall
        getAudioCoordinator().dispatch(
          inCall
            ? { type: 'start', source: 'call', id: 'whatsapp-call' }
            : { type: 'end', id: 'whatsapp-call' }
        )
      }
      const serialized = JSON.stringify(state)
      if (serialized !== lastPushed) {
        lastPushed = serialized
        push(state)
      }
      connection.check()
    }
  )
  const connection = new WhatsAppConnection(setup, () => {
    const state = controller.state()
    return !state.call && !state.pending
  })
  const stopWatchingLock = onAdminLocked(() => connection.closeSetup())
  app.once('before-quit', () => {
    controller.dispose()
    connection.dispose()
    stopWatchingLock()
    stopSetupUpdates()
  })
  const requireCaregiver = (event: IpcMainInvokeEvent): void => {
    requireAdminUnlocked()
    if (
      event.sender !== getAdminWindow()?.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error('Caregiver window required')
  }
  ipcMain.handle('whatsapp:setupState', (event) => {
    requireCaregiver(event)
    return setup.state()
  })
  ipcMain.handle('whatsapp:openSetup', (event) => {
    requireCaregiver(event)
    if (controller.state().call || controller.state().pending) throw new Error('End the call first')
    return connection.openSetup(getAdminWindow() ?? undefined)
  })
  ipcMain.handle('whatsapp:closeSetup', (event) => {
    requireCaregiver(event)
    return connection.closeSetup()
  })
  ipcMain.handle('whatsapp:prepare', (event) => {
    requireControlWindow(event)
    const home = getLauncherWindow()
    if (!home) throw new Error('Home is unavailable')
    connection.prepare(home)
    return controller.refresh()
  })
  ipcMain.handle('whatsapp:closeCalls', async (event) => {
    requireControlWindow(event)
    const state = controller.state()
    // Try the observed native control, then destroy the local peer even if its
    // queue/JS is hung. This never claims the remote person received a hangup.
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (
        state.call &&
        !state.pending &&
        state.availableActions.some((a) => a === 'end' || a === 'decline')
      )
        await Promise.race([
          controller.command(
            { type: state.call.phase === 'incoming' ? 'decline' : 'end', callId: state.call.id },
            () => requireControlWindow(event)
          ),
          new Promise((resolve) => {
            timer = setTimeout(resolve, 1500)
          })
        ])
    } catch {
      // Native failure must not suppress the local teardown or its proof.
    } finally {
      if (timer) clearTimeout(timer)
      connection.stop()
      controller.cancelPending()
    }
    return controller.refresh()
  })
  ipcMain.handle('whatsapp:state', (event) => {
    requireControlWindow(event)
    return controller.refresh()
  })
  ipcMain.handle('whatsapp:videoBounds', (event, value: unknown) => {
    const home = getLauncherWindow()
    if (!home || event.sender !== home.webContents || event.senderFrame !== event.sender.mainFrame)
      throw new Error('Home window required')
    const bounds = whatsAppVideoBoundsSchema.parse(value)
    if (bounds) {
      const [width = 0, height = 0] = home.getContentSize()
      // A renderer may position the canvas, but cannot cover window controls or
      // put remote content outside Home. Reject stale/out-of-window layouts.
      if (bounds.x + bounds.width > width || bounds.y + bounds.height > height)
        throw new Error('Video bounds outside Home')
    }
    setup.setVideoBounds(bounds)
  })
  ipcMain.handle('whatsapp:command', (event, command: unknown) => {
    requireControlWindow(event)
    return controller.command(command, () => requireControlWindow(event))
  })
}
