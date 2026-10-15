import type { PublicConfig, Tile } from '@shared/configSchema'
import { tilesInHome } from '@shared/homeLayout'
import {
  ACTION_REPLIES,
  type BuddyActionRequest,
  type BuddyActionResult
} from '@shared/buddy/actions'

/**
 * Recheck both processes after chat's await; a saved choice may have changed
 * meanwhile. Returns what Buddy should say, or null when nothing is known yet.
 */
export async function openBuddyTile(
  tileId: string,
  expectedConfig: PublicConfig | null,
  currentConfig: () => PublicConfig | null,
  validate: (request: BuddyActionRequest) => Promise<BuddyActionResult>,
  activate: (tile: Tile) => Promise<boolean | null>
): Promise<string | null> {
  const expected = expectedConfig?.tiles.find((tile) => tile.id === tileId)
  const currentTile = (): Tile | undefined => {
    const config = currentConfig()
    if (!config?.buddy.chatEnabled || !expected) return undefined
    return tilesInHome(config.display.homeLayout, config.tiles).find(
      (tile) => tile.id === tileId && tile.label === expected.label
    )
  }
  if (!currentTile()) return ACTION_REPLIES.tileUnavailable
  try {
    const result = await validate({ action: 'chooseTile', tileId, expectedLabel: expected!.label })
    if (!result.ok) return result.reply
    if (result.plan.action !== 'openTile' || result.plan.tileId !== tileId)
      return ACTION_REPLIES.tileUnavailable
    const tile = currentTile()
    if (!tile) return ACTION_REPLIES.tileUnavailable
    const opened = await activate(tile)
    // Still loading: claim neither success nor failure; the page answers for itself.
    if (opened === null) return null
    return opened ? ACTION_REPLIES.tileOpened : ACTION_REPLIES.tileFailed
  } catch {
    return ACTION_REPLIES.tileFailed
  }
}
