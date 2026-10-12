import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { toPublicConfig } from '@shared/configSchema'
import type { IpcResponse } from '@shared/ipcContract'
import { getConfig, setConfig } from '../config/store'
import { buildConfigBackup, ConfigBackupError, parseConfigBackup } from '../services/config/backup'
import { logActivity } from '../services/activityLog/activityLog'
import { getLauncherWindow } from '../windows/windowManager'
import { requireAdminUnlocked } from './requireAdminUnlocked'

const filters = [{ name: 'GrammieGuide backup', extensions: ['json'] }]

export function registerBackupIpc(): void {
  ipcMain.handle('backup:save', async (): Promise<IpcResponse<'backup:save'>> => {
    requireAdminUnlocked()
    let selection: Awaited<ReturnType<typeof dialog.showSaveDialog>>
    try {
      selection = await dialog.showSaveDialog({
        title: 'Save settings backup',
        defaultPath: 'GrammieGuide-settings-backup.json',
        filters,
        properties: ['dontAddToRecent']
      })
    } catch {
      return { ok: false, message: 'Could not open the save dialog. Please try again.' }
    }
    requireAdminUnlocked()
    if (selection.canceled || !selection.filePath) return { ok: false, canceled: true }
    try {
      await writeFile(selection.filePath, buildConfigBackup(getConfig()), {
        encoding: 'utf8',
        flush: true
      })
      logActivity('settings-backup-saved')
      return { ok: true }
    } catch {
      return {
        ok: false,
        message: 'Could not save the backup. Please choose another place and try again.'
      }
    }
  })

  ipcMain.handle('backup:restore', async (): Promise<IpcResponse<'backup:restore'>> => {
    requireAdminUnlocked()
    let selection: Awaited<ReturnType<typeof dialog.showOpenDialog>>
    try {
      selection = await dialog.showOpenDialog({
        title: 'Restore settings backup',
        filters,
        properties: ['openFile', 'dontAddToRecent']
      })
    } catch {
      return { ok: false, message: 'Could not open the file dialog. Please try again.' }
    }
    requireAdminUnlocked()
    if (selection.canceled || !selection.filePaths[0]) return { ok: false, canceled: true }
    let text: string
    try {
      text = await readFile(selection.filePaths[0], 'utf8')
    } catch {
      return {
        ok: false,
        message: 'Could not read the backup. Please choose a readable backup file.'
      }
    }
    // Dialogs and reads yield to other requests. Check the lock again and use
    // the latest device secrets, then validate before the first config write.
    requireAdminUnlocked()
    try {
      const restored = parseConfigBackup(text, getConfig())
      const config = toPublicConfig(setConfig(restored))
      getLauncherWindow()?.webContents.send('config:changed', config)
      logActivity('settings-backup-restored')
      return { ok: true, config }
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ConfigBackupError
            ? error.message
            : 'Could not restore the backup. Please try again.'
      }
    }
  })
}
