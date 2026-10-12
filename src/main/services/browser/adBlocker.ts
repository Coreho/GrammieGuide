import { readFile, writeFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { session } from 'electron'
import { ElectronBlocker, adsAndTrackingLists } from '@ghostery/adblocker-electron'
import { logActivity } from '../activityLog/activityLog'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { WEB_PARTITION, hardenWebSession } from './webSession'

/**
 * Ads and trackers in the embedded browser only.
 *
 * Why it matters here rather than as a nicety: ads are how scam pages and
 * misleading "download" buttons reach otherwise ordinary sites, and pop-ups plus
 * autoplay video are exactly what make a news site unusable for her. The blocker
 * attaches to the browser's own session (TASK-01), so Home and the caregiver
 * panel are never touched by it.
 *
 * Startup must not depend on the network. The engine is cached on disk, so every
 * start after the first deserializes the filters straight from userData and never
 * touches the network at all. Only the very first run on a machine has to reach
 * the list host; if that fails we log it and carry on unblocked, because web tiles
 * matter more than filtering.
 *
 * A refresh builds a whole new engine from the current lists and saves it over the
 * cache, rather than adding lines to the running one: adding alone kept rules the
 * lists had since dropped (often false positives that break a site) and was lost on
 * the next start. The kiosk restarts most days, so a 24-hour timer alone would
 * almost never fire; a cache older than a day is also refreshed soon after start.
 */

/** Where the serialized engine lives, beside the other per-machine state. */
const ENGINE_CACHE = 'adblocker-engine.bin'

/** How often to refresh the lists in the background. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/** A stale cache is refreshed this long after start, so startup itself stays offline. */
const STALE_REFRESH_DELAY_MS = 5 * 60 * 1000

let blocker: ElectronBlocker | null = null
let cachePath: string | null = null
let refreshTimer: NodeJS.Timeout | null = null
let staleRefreshTimer: NodeJS.Timeout | null = null

async function readCache(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path))
}

async function writeCache(path: string, buffer: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // Write beside it, then rename: a power cut mid-write must not leave a truncated
  // engine that the next offline start would fail to load.
  const temporary = `${path}.tmp`
  try {
    await writeFile(temporary, buffer)
    await rename(temporary, path)
  } catch (error) {
    // A partial write or failed rename must not leave another engine on disk.
    // Cleanup is best effort; preserve the original error and the saved cache.
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/**
 * Attach the blocker to the web session. Returns whether blocking is actually on,
 * so a caller (and the e2e suite) can tell "working" from "started but inert".
 */
export async function startAdBlocker(userDataPath: string): Promise<boolean> {
  if (blocker) return true
  const ses = session.fromPartition(WEB_PARTITION)

  cachePath = join(userDataPath, ENGINE_CACHE)
  // A power cut can skip writeCache's cleanup. Remove only our exact temp file,
  // even on offline starts that never write; a locked leftover must not stop blocking.
  await unlink(`${cachePath}.tmp`).catch(() => {})
  let engine: ElectronBlocker
  try {
    engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(undefined, {
      path: cachePath,
      read: readCache,
      write: writeCache
    })
  } catch (error) {
    // Browsing matters more than blocking: web tiles still open, unfiltered.
    logReliabilityEvent({
      op: 'adblocker-start',
      ok: false,
      detail: `continuing without blocking: ${String(error)}`
    })
    logActivity('adblocker-unavailable')
    return false
  }

  engine.enableBlockingInSession(ses)
  blocker = engine
  logReliabilityEvent({ op: 'adblocker-start', ok: true, detail: 'ads and tracking blocked' })
  logActivity('adblocker-enabled')
  scheduleRefresh()
  void refreshIfStale(cachePath)
  return true
}

async function refreshIfStale(path: string): Promise<void> {
  const saved = await stat(path).catch(() => null)
  if (!saved || Date.now() - saved.mtimeMs < REFRESH_INTERVAL_MS) return
  if (staleRefreshTimer) clearTimeout(staleRefreshTimer)
  staleRefreshTimer = setTimeout(() => void refreshAdBlockerLists(), STALE_REFRESH_DELAY_MS)
  staleRefreshTimer.unref?.()
}

/**
 * Refresh the lists now, off the same path the timer uses. A failed update is
 * logged and dropped: the engine already in memory keeps working, which is the
 * whole point of never letting list freshness affect browsing.
 *
 * Returns whether the lists were updated. `scheduleRefresh` calls this on a
 * timer; e2e calls it directly, because the real interval is 24 hours and the
 * failure it has to survive is the interesting half.
 */
export async function refreshAdBlockerLists(): Promise<boolean> {
  if (!blocker) return false
  const current = blocker
  try {
    // The same lists and resources the first start used, built fresh, so rules
    // the lists dropped are gone too. Any fetch failure throws before the swap.
    const fresh = await ElectronBlocker.fromLists(fetch, adsAndTrackingLists)
    if (blocker !== current) return false // stopped or restarted meanwhile
    const ses = session.fromPartition(WEB_PARTITION)
    // Disable first: both engines register the same IPC channels. Both calls are
    // synchronous, so no request slips through unfiltered between them.
    current.disableBlockingInSession(ses)
    try {
      fresh.enableBlockingInSession(ses)
    } catch (error) {
      current.enableBlockingInSession(ses)
      throw error
    }
    blocker = fresh
    let saved = true
    if (cachePath) {
      // Saved so the next start, offline or not, begins from these lists.
      await writeCache(cachePath, fresh.serialize()).catch(() => {
        saved = false
      })
    }
    logReliabilityEvent({
      op: 'adblocker-update',
      ok: saved,
      detail: saved ? 'lists updated' : 'lists updated, but the saved copy could not be replaced'
    })
    return true
  } catch (error) {
    logReliabilityEvent({
      op: 'adblocker-update',
      ok: false,
      detail: `keeping current lists: ${String(error)}`
    })
    return false
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(() => {
    void refreshAdBlockerLists()
  }, REFRESH_INTERVAL_MS)
  // Never hold the app open just to refresh a list.
  refreshTimer.unref?.()
}

export function isAdBlockerActive(): boolean {
  return blocker !== null
}

/** Shutdown hook: stop the refresh timer. */
export function stopAdBlocker(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  if (staleRefreshTimer) clearTimeout(staleRefreshTimer)
  refreshTimer = null
  staleRefreshTimer = null
  blocker = null
  cachePath = null
}

/**
 * Start hardening and blocking together, so a caller cannot get one without the
 * other. Blocking never blocks startup: Home is usable either way.
 */
export async function startBrowserProtection(userDataPath: string): Promise<boolean> {
  hardenWebSession()
  return startAdBlocker(userDataPath)
}
