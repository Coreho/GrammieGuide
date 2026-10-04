import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { session } from 'electron'
import {
  ElectronBlocker,
  adsAndTrackingLists,
  fetchLists,
  getLinesWithFilters
} from '@ghostery/adblocker-electron'
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
 */

/** Where the serialized engine lives, beside the other per-machine state. */
const ENGINE_CACHE = 'adblocker-engine.bin'

/** How often to refresh the lists in the background. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

let blocker: ElectronBlocker | null = null
let refreshTimer: NodeJS.Timeout | null = null

async function readCache(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path))
}

async function writeCache(path: string, buffer: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)
}

/**
 * Attach the blocker to the web session. Returns whether blocking is actually on,
 * so a caller (and the e2e suite) can tell "working" from "started but inert".
 */
export async function startAdBlocker(userDataPath: string): Promise<boolean> {
  if (blocker) return true
  const ses = session.fromPartition(WEB_PARTITION)

  let engine: ElectronBlocker
  try {
    engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(undefined, {
      path: join(userDataPath, ENGINE_CACHE),
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
  scheduleRefresh(engine)
  return true
}

/**
 * Refresh the lists later. A failed update is logged and dropped: the engine
 * already in memory keeps working, which is the whole point of never letting list
 * freshness affect browsing.
 */
function scheduleRefresh(engine: ElectronBlocker): void {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(() => {
    void (async () => {
      try {
        const lists = await fetchLists(fetch, adsAndTrackingLists)
        // Comments and unsupported lines are dropped here rather than at parse time.
        const added = lists.flatMap((list) => [...getLinesWithFilters(list)])
        const changed = engine.updateFromDiff({ added })
        logReliabilityEvent({
          op: 'adblocker-update',
          ok: true,
          detail: changed ? 'lists updated' : 'lists unchanged'
        })
      } catch (error) {
        logReliabilityEvent({
          op: 'adblocker-update',
          ok: false,
          detail: `keeping current lists: ${String(error)}`
        })
      }
    })()
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
  refreshTimer = null
  blocker = null
}

/**
 * Start hardening and blocking together, so a caller cannot get one without the
 * other. Blocking never blocks startup: Home is usable either way.
 */
export async function startBrowserProtection(userDataPath: string): Promise<boolean> {
  hardenWebSession()
  return startAdBlocker(userDataPath)
}
