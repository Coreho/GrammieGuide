import { runPowerShell, type ExecFileFn } from './shellExec'

/**
 * The one place Windows Scheduled Tasks are registered from - the kiosk's
 * autostart task and its watchdog both go through here.
 *
 * Both run as the logged-in user at the *highest* run level when the app can
 * register that (i.e. it's running elevated, as it is right after the
 * installer and whenever the autostart task launched it): Wi-Fi healing's
 * Restart-NetAdapter needs admin, and an elevated watchdog can stop a hung
 * elevated app. If registration at that level is refused (a standard user),
 * it falls back to the normal level rather than not registering at all.
 *
 * Old app's registrations (index.js / watchdog.js) had two latent bugs
 * fixed here: the autostart task kept Task Scheduler's default 72-hour
 * execution limit (Windows would kill the kiosk every three days), and paths
 * were interpolated into single-quoted PowerShell strings without escaping.
 */

export const AUTOSTART_TASK = 'GrammieGuide'
export const WATCHDOG_TASK = 'GrammieGuideWatchdog'

/** PowerShell single-quoted literal: the only escape inside one is doubling the quote. */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export type TaskSpec = {
  name: string
  execute: string
  argument?: string
  trigger: 'at-logon' | 'every-minute'
  /** 0 = no limit (the app itself); otherwise minutes. */
  timeLimitMinutes: number
}

export type TaskRegistration = { ok: boolean; runLevel: 'highest' | 'limited' | 'left-disabled' | null; detail: string }

/**
 * `keepDisabled`: a task someone disabled on purpose (rollback to the old
 * launcher does exactly that) stays disabled - otherwise merely opening
 * GrammieGuide once would re-arm its autostart and both launchers would
 * start at the next logon. Only the admin panel's explicit "Re-register"
 * turns it back on.
 */
export function buildRegisterScript(spec: TaskSpec, opts: { keepDisabled?: boolean } = {}): string {
  const action = spec.argument
    ? `New-ScheduledTaskAction -Execute ${psQuote(spec.execute)} -Argument ${psQuote(spec.argument)}`
    : `New-ScheduledTaskAction -Execute ${psQuote(spec.execute)}`
  const trigger =
    spec.trigger === 'at-logon'
      ? 'New-ScheduledTaskTrigger -AtLogOn -User $user'
      : 'New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)'
  const limit = spec.timeLimitMinutes === 0 ? '([TimeSpan]::Zero)' : `(New-TimeSpan -Minutes ${spec.timeLimitMinutes})`
  const keepDisabled = opts.keepDisabled
    ? `$existing = Get-ScheduledTask -TaskName ${psQuote(spec.name)} -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Disabled') { Write-Output 'left-disabled'; exit 0 }
`
    : ''
  return `
$ErrorActionPreference = 'Stop'
${keepDisabled}$user = "$env:USERDOMAIN\\$env:USERNAME"
$action = ${action}
$trigger = ${trigger}
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ${limit}
try {
  $principal = New-ScheduledTaskPrincipal -UserId $user -RunLevel Highest -LogonType Interactive
  Register-ScheduledTask -TaskName ${psQuote(spec.name)} -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  $level = 'highest'
} catch {
  $principal = New-ScheduledTaskPrincipal -UserId $user -RunLevel Limited -LogonType Interactive
  Register-ScheduledTask -TaskName ${psQuote(spec.name)} -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  $level = 'limited'
}
if (Get-ScheduledTask -TaskName ${psQuote(spec.name)} -ErrorAction SilentlyContinue) { Write-Output $level } else { exit 1 }
`.trim()
}

/** Registers (or re-registers, so paths stay right after an update) and verifies the task exists. */
export async function registerTask(
  spec: TaskSpec,
  execFileImpl?: ExecFileFn,
  opts: { keepDisabled?: boolean } = {}
): Promise<TaskRegistration> {
  const result = await runPowerShell(buildRegisterScript(spec, opts), { execFileImpl })
  const level = result.stdout.trim()
  if (result.ok && level === 'left-disabled') {
    return { ok: true, runLevel: level, detail: `${spec.name} is disabled (e.g. after a rollback) - left off` }
  }
  if (result.ok && (level === 'highest' || level === 'limited')) {
    return { ok: true, runLevel: level, detail: `${spec.name} registered (${level} run level)` }
  }
  return { ok: false, runLevel: null, detail: `${spec.name}: ${result.error ?? result.stderr}`.trim() }
}

export async function unregisterTask(name: string, execFileImpl?: ExecFileFn): Promise<boolean> {
  const result = await runPowerShell(
    `Unregister-ScheduledTask -TaskName ${psQuote(name)} -Confirm:$false -ErrorAction SilentlyContinue`,
    { execFileImpl }
  )
  return result.ok
}
