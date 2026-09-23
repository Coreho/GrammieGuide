import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { runPowerShell, type ExecFileFn } from './shellExec'
import { logReliabilityEvent } from './reliabilityLog'

/**
 * External watchdog: a 15s heartbeat file the app writes to, checked once a
 * minute by an independent Windows Scheduled Task running
 * resources/watchdog/watchdog.ps1 (kept ASCII-only / UTF-8-BOM to close the
 * mojibake bug found in the old app's copy of this script at
 * resources/watchdog/watchdog.ps1:23). Registration now goes through
 * shellExec instead of the old app's hand-rolled base64 in watchdog.js, and
 * is verified with Get-ScheduledTask immediately after so a silent
 * registration failure actually surfaces (old app: a console.warn nobody saw).
 */

const HEARTBEAT_INTERVAL_MS = 15_000
const TASK_NAME = 'GrammieGuideWatchdog'

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
  execFileImpl?: ExecFileFn
): Promise<boolean> {
  const registerScript = `
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -File "${watchdogScriptPath}" -HeartbeatPath "${heartbeatPath}" -ExePath "${exePath}"'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
`.trim()

  const registerResult = await runPowerShell(registerScript, { execFileImpl })
  if (!registerResult.ok) {
    logReliabilityEvent({
      op: 'watchdog-register',
      ok: false,
      detail: registerResult.error ?? registerResult.stderr,
      durationMs: registerResult.durationMs
    })
    return false
  }

  const verifyResult = await runPowerShell(
    `if (Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue) { Write-Output 'present' } else { exit 1 }`,
    { execFileImpl }
  )
  logReliabilityEvent({
    op: 'watchdog-register',
    ok: verifyResult.ok,
    detail: verifyResult.ok ? 'verified present via Get-ScheduledTask' : 'registered but verification failed',
    durationMs: verifyResult.durationMs
  })
  return verifyResult.ok
}
