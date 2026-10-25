import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ContactPerson } from '@shared/contactSettings'
import type { WhatsAppCallState } from '@shared/whatsAppCalls'
import { getConfig } from '../config/store'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { isAdminUnlocked, onAdminLocked } from '../services/auth/adminAuth'
import { WhatsAppController } from '../services/whatsapp/whatsAppController'
import type { WhatsAppAdapter } from '../services/whatsapp/whatsAppAdapter'
import { EmbeddedWhatsAppSession } from '../services/whatsapp/whatsAppSession'
import { createWhatsAppSessionAdapter } from '../services/whatsapp/whatsAppSessionAdapter'
import { requireAdminUnlocked } from './requireAdminUnlocked'

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
  const controller = new WhatsAppController(
    adapter ?? createWhatsAppSessionAdapter(setup),
    () => {
      const { preferred, fallback } = getConfig().contacts
      return [preferred, fallback].filter((person): person is ContactPerson => person !== null)
    },
    push
  )
  const stopWatchingLock = onAdminLocked(() => setup.close())
  app.once('before-quit', () => {
    controller.dispose()
    setup.dispose()
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
    return setup.open(getAdminWindow() ?? undefined)
  })
  ipcMain.handle('whatsapp:closeSetup', (event) => {
    requireCaregiver(event)
    return setup.close()
  })
  ipcMain.handle('whatsapp:state', (event) => {
    requireControlWindow(event)
    return controller.refresh()
  })
  ipcMain.handle('whatsapp:command', (event, command: unknown) => {
    requireControlWindow(event)
    return controller.command(command, () => requireControlWindow(event))
  })
}
