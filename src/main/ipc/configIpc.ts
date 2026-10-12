import { ipcMain } from 'electron'
import { getConfig, setConfig } from '../config/store'
import { toPublicConfig, mergeAdminPatch, tileSchema, type Config } from '@shared/configSchema'
import { nextTileColor } from '@shared/tileColors'
import {
  availableSlots,
  placeTilesInOrder,
  preserveTileSlots,
  type HomeLayoutName
} from '@shared/homeLayout'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { logActivity } from '../services/activityLog/activityLog'
import { getLauncherWindow } from '../windows/windowManager'

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', () => toPublicConfig(getConfig()))

  ipcMain.handle('config:set', (_e, patch: Partial<Config>) => {
    requireAdminUnlocked()
    // Secrets (API key, PIN hash/salt) only change via their own admin:*
    // channels - never set or cleared through the generic config writer.
    const current = getConfig()
    const sanitized = mergeAdminPatch(current, patch)
    const layout = (sanitized.display?.homeLayout ?? current.display.homeLayout) as HomeLayoutName
    if (
      sanitized.display?.homeLayout !== undefined &&
      sanitized.display.homeLayout !== current.display.homeLayout &&
      sanitized.tiles === undefined
    ) {
      // A non-admin caller may change only the layout. Re-place in the order
      // currently seen on Home so the result is still complete and deterministic.
      const ordered = [...current.tiles].sort(
        (a, b) => (a.slot ?? Number.MAX_SAFE_INTEGER) - (b.slot ?? Number.MAX_SAFE_INTEGER)
      )
      sanitized.tiles = placeTilesInOrder(layout, ordered)
    }
    if (sanitized.tiles !== undefined) {
      const autoPlaceIds = new Set<string>()
      const tiles = sanitized.tiles.map((tile) => {
        const saved = current.tiles.find((candidate) => candidate.id === tile.id)
        const slotWasProvided = tile.slot !== undefined
        if (!slotWasProvided && !saved) autoPlaceIds.add(tile.id)
        return {
          ...tile,
          colorIndex: tile.colorIndex ?? saved?.colorIndex,
          slot: slotWasProvided ? tile.slot : (saved?.slot ?? null)
        }
      })
      // Reserve explicit choices before assigning colors to any new tiles.
      for (const tile of tiles) tile.colorIndex ??= nextTileColor(tiles)
      const positioned = preserveTileSlots(layout, tileSchema.array().parse(tiles))
      // Old callers do not know about slots. Give only those new tiles the first
      // hole; explicit null is overflow and must remain there.
      for (const tile of positioned) {
        if (!autoPlaceIds.has(tile.id)) continue
        tile.slot = availableSlots(layout, positioned, tile.size, tile.id)[0] ?? null
      }
      sanitized.tiles = positioned
    }
    // setConfig validates and throws before touching the cache or the file, so
    // this log line - and the config:changed push below it - only ever describe a
    // change that actually happened.
    const updated = toPublicConfig(setConfig(sanitized))
    logActivity('config-updated', Object.keys(sanitized).join(','))
    // The launcher only reads config on mount - push admin edits to it so
    // a new tile or theme shows up on her screen without a restart.
    getLauncherWindow()?.webContents.send('config:changed', updated)
    return updated
  })
}
