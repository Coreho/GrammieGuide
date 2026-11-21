import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import type { IpcResponse } from '@shared/ipcContract'
import { nursingForHome } from '@shared/nursing/nursingHistory'
import type { LibraryEntry } from '@shared/media/libraryTypes'
import { NursingStore } from '../services/nursing/nursingStore'
import { getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'

export interface NursingIpcOptions {
  /** The one shared store for the nursing media library (see registerLibraryIpc). */
  pages: () => { list(): Promise<LibraryEntry[]> }
  folder?: () => string
}

function requireHome(event: IpcMainInvokeEvent): void {
  if (
    event.sender !== getLauncherWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Home window required')
  }
}

/**
 * Home reads her nursing history; nothing here writes it. The history is loaded onto her
 * computer by the caregiver (TASK-93); editing it from the admin panel is later work.
 */
export function registerNursingIpc({
  pages,
  folder = () => join(app.getPath('userData'), 'nursing')
}: NursingIpcOptions): void {
  // Lazy so registration itself never touches disk.
  let store: NursingStore | undefined
  const nursing = (): NursingStore =>
    (store ??= new NursingStore(folder(), (backupName) =>
      logReliabilityEvent({ op: 'nursing-reset', ok: false, detail: backupName })
    ))

  ipcMain.handle('nursing:home', async (event): Promise<IpcResponse<'nursing:home'>> => {
    requireHome(event)
    // Content-free: never a chapter, a paper's title or her words.
    logActivity('nursing-history-opened')
    let entries: LibraryEntry[] = []
    try {
      entries = await pages().list()
    } catch {
      // Pages unreadable for now: the words still show, each page with its calm line.
    }
    return nursingForHome(await nursing().read(), entries)
  })
}
