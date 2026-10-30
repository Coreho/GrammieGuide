import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcResponse } from '@shared/ipcContract'
import {
  changeRows,
  knittingProjectInputSchema,
  type AdminKnitting,
  type HomeKnitting,
  type KnittingFile
} from '@shared/knitting/knitting'
import { KnittingStore } from '../services/knitting/knittingStore'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { logActivity } from '../services/activityLog/activityLog'
import { logReliabilityEvent } from '../services/reliability/reliabilityLog'

export type KnittingPhoto = { url: string; thumbnailUrl: string }

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

function forAdmin(file: KnittingFile): AdminKnitting {
  const project = file.project
  return {
    project: project && {
      name: project.name,
      forWhom: project.forWhom,
      photoId: project.photoId,
      rows: project.rows
    }
  }
}

/**
 * Logs say that the counter or the project changed, never what she is making or
 * who it is for: those are family details, and the activity log reaches admin.
 */
export function registerKnittingIpc(
  photo: (id: string | undefined) => Promise<KnittingPhoto | undefined> = async () => undefined,
  folder: () => string = () => join(app.getPath('userData'), 'knitting'),
  now: () => number = Date.now
): void {
  // Lazy so registration itself never touches disk.
  let store: KnittingStore | undefined
  const knitting = (): KnittingStore =>
    (store ??= new KnittingStore(folder(), (backupName) =>
      logReliabilityEvent({ op: 'knitting-reset', ok: false, detail: backupName })
    ))

  const forHome = async (file: KnittingFile): Promise<HomeKnitting> => {
    const project = file.project
    if (!project) return { project: null }
    // A photo removed from the library just leaves the yarn icon in its place.
    const picture = await photo(project.photoId).catch(() => undefined)
    return {
      project: {
        name: project.name,
        forWhom: project.forWhom,
        rows: project.rows,
        ...(picture && { photoUrl: picture.url, thumbnailUrl: picture.thumbnailUrl })
      }
    }
  }

  const announce = (): void => {
    for (const window of [getLauncherWindow(), getAdminWindow()]) {
      try {
        window?.webContents.send('knitting:changed', {})
      } catch {
        // The change is saved; a window that missed this reads it again when it opens.
      }
    }
  }

  ipcMain.handle('knitting:home', async (event): Promise<IpcResponse<'knitting:home'>> => {
    requireHome(event)
    return forHome(await knitting().read())
  })

  ipcMain.handle(
    'knitting:changeRows',
    async (event, req: { direction?: unknown }): Promise<IpcResponse<'knitting:changeRows'>> => {
      requireHome(event)
      const direction = req?.direction
      if (direction !== 'add' && direction !== 'remove') throw new Error('Unknown row change')
      let changed = false
      const file = await knitting().update((current) => {
        if (!current.project) return current
        const project = changeRows(current.project, direction, now())
        if (project === current.project) return current
        changed = true
        return { ...current, project }
      })
      if (changed) {
        logActivity(direction === 'add' ? 'knitting-row-added' : 'knitting-row-removed')
        announce()
      }
      return forHome(file)
    }
  )

  ipcMain.handle('knitting:get', async (event): Promise<IpcResponse<'knitting:get'>> => {
    requireCaregiver(event)
    return forAdmin(await knitting().read())
  })

  ipcMain.handle(
    'knitting:saveProject',
    async (event, value: unknown): Promise<IpcResponse<'knitting:saveProject'>> => {
      requireCaregiver(event)
      const input = knittingProjectInputSchema.parse(value)
      const file = await knitting().update((current) => {
        const keep = current.project && !input.startNew ? current.project : undefined
        return {
          version: 1,
          project: {
            id: keep?.id ?? randomUUID(),
            name: input.name,
            forWhom: input.forWhom,
            ...(input.photoId && { photoId: input.photoId }),
            rows: keep?.rows ?? 0,
            ...(keep?.lastChange && { lastChange: keep.lastChange })
          }
        }
      })
      logActivity(input.startNew ? 'knitting-project-started' : 'knitting-project-saved')
      announce()
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'knitting:resetRows',
    async (event): Promise<IpcResponse<'knitting:resetRows'>> => {
      requireCaregiver(event)
      const file = await knitting().update((current) =>
        current.project
          ? { ...current, project: { ...current.project, rows: 0, lastChange: undefined } }
          : current
      )
      logActivity('knitting-rows-reset')
      announce()
      return forAdmin(file)
    }
  )

  ipcMain.handle(
    'knitting:removeProject',
    async (event): Promise<IpcResponse<'knitting:removeProject'>> => {
      requireCaregiver(event)
      const file = await knitting().update((current) =>
        current.project ? { version: 1, project: null } : current
      )
      logActivity('knitting-project-removed')
      announce()
      return forAdmin(file)
    }
  )
}
