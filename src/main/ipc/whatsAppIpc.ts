import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ContactPerson } from '@shared/contactSettings'
import type { WhatsAppCallState } from '@shared/whatsAppCalls'
import { getConfig } from '../config/store'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { isAdminUnlocked } from '../services/auth/adminAuth'
import { WhatsAppController } from '../services/whatsapp/whatsAppController'
import {
  unverifiedWhatsAppAdapter,
  type WhatsAppAdapter
} from '../services/whatsapp/whatsAppAdapter'
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
export function registerWhatsAppIpc(adapter: WhatsAppAdapter = unverifiedWhatsAppAdapter()): void {
  const controller = new WhatsAppController(
    adapter,
    () => {
      const { preferred, fallback } = getConfig().contacts
      return [preferred, fallback].filter((person): person is ContactPerson => person !== null)
    },
    push
  )
  app.once('before-quit', () => controller.dispose())
  ipcMain.handle('whatsapp:state', (event) => {
    requireControlWindow(event)
    return controller.refresh()
  })
  ipcMain.handle('whatsapp:command', (event, command: unknown) => {
    requireControlWindow(event)
    return controller.command(command, () => requireControlWindow(event))
  })
}
