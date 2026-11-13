import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcResponse } from '@shared/ipcContract'
import { getContactRequests, contactNow } from '../services/contacts/contactRuntime'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getConfig, setConfig } from '../config/store'
import { toPublicConfig } from '@shared/configSchema'
import { smsCallbacksAvailable } from '../services/contacts/smsCallbacks'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { ContactController } from '../services/contacts/contactController'
import { logActivity } from '../services/activityLog/activityLog'

function requireCaregiver(event: IpcMainInvokeEvent): void {
  requireAdminUnlocked()
  if (
    event.sender !== getAdminWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Caregiver window required')
  }
}

function requireHome(event: IpcMainInvokeEvent): void {
  if (
    event.sender !== getLauncherWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Home window required')
  }
}

/** TASK-25 can read saved outcomes without gaining a send API or caregiver phone numbers. */
export function registerContactIpc(
  photo: (id: string | undefined) => Promise<string | undefined> = async () => undefined
): void {
  // Lazy so registration itself never touches disk or starts a request.
  let controller: ContactController | undefined
  const control = (): ContactController =>
    (controller ??= new ContactController(
      getContactRequests(),
      () => getConfig().contacts,
      (contacts) => {
        const updated = toPublicConfig(setConfig({ contacts }), smsCallbacksAvailable())
        try {
          getLauncherWindow()?.webContents.send('config:changed', updated)
        } catch {
          // The save already succeeded. A recovering Home reads it again at mount;
          // a failed push must not make the caregiver think the save was refused.
        }
      },
      photo,
      contactNow
    ))
  ipcMain.handle('contacts:list', async (): Promise<IpcResponse<'contacts:list'>> => {
    requireAdminUnlocked()
    return getContactRequests().list()
  })
  ipcMain.handle('contacts:images', async (event): Promise<IpcResponse<'contacts:images'>> => {
    requireHome(event)
    const entries = await Promise.all(
      getConfig().contacts.people.map(async (person) => {
        const url = await photo(person.photoId).catch(() => undefined)
        return [person.id, url] as const
      })
    )
    return Object.fromEntries(
      entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    )
  })
  ipcMain.handle('contacts:home', async (event): Promise<IpcResponse<'contacts:home'>> => {
    requireHome(event)
    // While SMS callbacks are hidden, Home learns of no contact and so draws no
    // button or status, even if a caregiver saved the feature as on.
    if (!smsCallbacksAvailable()) return { contact: null, request: null }
    return control().home()
  })
  ipcMain.handle('contacts:request', async (event): Promise<IpcResponse<'contacts:request'>> => {
    requireHome(event)
    if (!smsCallbacksAvailable()) return { contact: null, request: null, problem: 'not-configured' }
    return control().request()
  })
  ipcMain.handle('contacts:getSettings', (event): IpcResponse<'contacts:getSettings'> => {
    requireCaregiver(event)
    return { ...control().settings(), smsCallbacks: smsCallbacksAvailable() }
  })
  ipcMain.handle(
    'contacts:saveSettings',
    async (event, value: unknown): Promise<IpcResponse<'contacts:saveSettings'>> => {
      requireCaregiver(event)
      const result = await control().saveSettings(value)
      logActivity('contact-settings-saved')
      return { ...result, smsCallbacks: smsCallbacksAvailable() }
    }
  )
  ipcMain.handle(
    'contacts:testState',
    async (event): Promise<IpcResponse<'contacts:testState'>> => {
      requireCaregiver(event)
      return control().testState()
    }
  )
  ipcMain.handle(
    'contacts:startTest',
    async (event, value: unknown): Promise<IpcResponse<'contacts:startTest'>> => {
      requireCaregiver(event)
      const contactId =
        value && typeof value === 'object' ? (value as { contactId?: unknown }).contactId : null
      // The panel is hidden with the feature, and main refuses it too, so no
      // text can leave before the carriers approve the campaign.
      const result = smsCallbacksAvailable()
        ? await control().startTest(contactId)
        : await control().testState('not-configured')
      // Which person and what happened next stay out of the log; outcomes are
      // logged by the runtime as contact-test-<status>.
      logActivity(
        result.problem ? `contact-test-refused-${result.problem}` : 'contact-test-started'
      )
      return result
    }
  )
  ipcMain.handle(
    'admin:setContactCredentials',
    async (event, value: unknown): Promise<IpcResponse<'admin:setContactCredentials'>> => {
      requireCaregiver(event)
      await control().setCredentials(value)
      logActivity(value === null ? 'contact-credentials-cleared' : 'contact-credentials-saved')
      return { ok: true }
    }
  )
}
