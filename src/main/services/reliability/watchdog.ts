import { writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import type { ExecFileFn } from './shellExec'
import { registerTask, AUTOSTART_TASK, WATCHDOG_TASK } from './scheduledTasks'
import { logReliabilityEvent } from './reliabilityLog'

/**
 * External watchdog: a 15s heartbeat file the app writes to, checked once a
 * minute by an independent Windows Scheduled Task running
 * resources/watchdog/watchdog.ps1 (kept ASCII-only / UTF-8-BOM to close the
 * mojibake bug found in the old app's copy of this script at
 * resources/watchdog/watchdog.ps1:23). Registration now goes through
 * scheduledTasks.ts instead of the old app's hand-rolled base64 in
 * watchdog.js, and is verified with Get-ScheduledTask in the same script so
 * a silent registration failure actually surfaces (old app: a console.warn
 * nobody saw).
 */

const HEARTBEAT_INTERVAL_MS = 15_000

let heartbeatTimer: NodeJS.Timeout | null = null

export function startHeartbeat(heartbeatPath: string): void {
  const dir = join(heartbeatPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const beat = (): void => {
    try {
      writeFileSync(heartbeatPath, String(Date.now()), 'utf8')
    } catch (err) {
      logReliabilityEvent({ op: 'heartbeat-write', ok: false, detail: String(err) })
    }
  }
  beat()
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

export async function registerWatchdogTask(
  watchdogScriptPath: string,
  heartbeatPath: string,
  exePath: string,
  execFileImpl?: ExecFileFn,
  opts: { keepDisabled?: boolean } = {}
): Promise<boolean> {
  // -ExecutionPolicy Bypass: Windows client editions default to Restricted,
  // under which -File refuses to run the script at all - M1's registration
  // check passed while the watchdog itself could never have executed.
  const result = await registerTask(
    {
      name: WATCHDOG_TASK,
      execute: 'powershell.exe',
      argument: `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${watchdogScriptPath}" -HeartbeatPath "${heartbeatPath}" -ExePath "${exePath}"`,
      trigger: 'every-minute',
      timeLimitMinutes: 2
    },
    execFileImpl,
    opts
  )
  logReliabilityEvent({ op: 'watchdog-register', ok: result.ok, detail: result.detail })
  return result.ok
}

/** Starts the installed app when she logs in. Runs with no time limit (see scheduledTasks.ts). */
export async function registerAutostartTask(
  exePath: string,
  execFileImpl?: ExecFileFn,
  opts: { keepDisabled?: boolean } = {}
): Promise<boolean> {
  const result = await registerTask(
    { name: AUTOSTART_TASK, execute: exePath, trigger: 'at-logon', timeLimitMinutes: 0 },
    execFileImpl,
    opts
  )
  logReliabilityEvent({ op: 'autostart-register', ok: result.ok, detail: result.detail })
  return result.ok
}

/**
 * Ctrl+Shift+Q means "really close the kiosk": the watchdog script sees this
 * flag and leaves it closed instead of relaunching it a minute later. The
 * next start (autostart at logon, or someone opening it) clears it, which
 * re-arms the watchdog.
 */
export const QUIT_FLAG = 'quit-flag.txt'

export function writeQuitFlag(userDataDir: string): void {
  try {
    writeFileSync(join(userDataDir, QUIT_FLAG), new Date().toISOString(), 'utf8')
  } catch (err) {
    logReliabilityEvent({ op: 'quit-flag-write', ok: false, detail: String(err) })
  }
}

export function clearQuitFlag(userDataDir: string): void {
  try {
    rmSync(join(userDataDir, QUIT_FLAG), { force: true })
  } catch (err) {
    logReliabilityEvent({ op: 'quit-flag-clear', ok: false, detail: String(err) })
  }
}
