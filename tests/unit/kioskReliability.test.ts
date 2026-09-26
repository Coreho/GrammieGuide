import { describe, it, expect } from 'vitest'
import {
  buildRegisterScript,
  psQuote,
  registerTask,
  AUTOSTART_TASK,
  WATCHDOG_TASK
} from '../../src/main/services/reliability/scheduledTasks'
import {
  decideWifi,
  INITIAL_WIFI_STATE,
  OFFLINE_BEFORE_RESTART_MS,
  RESTART_COOLDOWN_MS,
  type WifiWatchState
} from '../../src/main/services/reliability/wifiWatch'
import type { ExecFileFn } from '../../src/main/services/reliability/shellExec'

function fakeExecFile(stdout: string, err: Error | null = null): ExecFileFn {
  return ((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
    ;(cb as (e: Error | null, o: string, s: string) => void)(err, stdout, '')
    return {} as ReturnType<ExecFileFn>
  }) as unknown as ExecFileFn
}

describe('scheduled task scripts', () => {
  it('escapes single quotes so a path like O\'Brien cannot break the script', () => {
    expect(psQuote("C:\\Users\\O'Brien\\app.exe")).toBe("'C:\\Users\\O''Brien\\app.exe'")
    const script = buildRegisterScript({
      name: AUTOSTART_TASK,
      execute: "C:\\Users\\O'Brien\\GrammieGuide.exe",
      trigger: 'at-logon',
      timeLimitMinutes: 0
    })
    expect(script).toContain("-Execute 'C:\\Users\\O''Brien\\GrammieGuide.exe'")
  })

  it('the autostart task runs at her logon with no time limit (the 72h default would close the kiosk)', () => {
    const script = buildRegisterScript({ name: AUTOSTART_TASK, execute: 'C:\\app.exe', trigger: 'at-logon', timeLimitMinutes: 0 })
    expect(script).toContain('New-ScheduledTaskTrigger -AtLogOn -User $user')
    expect(script).toContain('-ExecutionTimeLimit ([TimeSpan]::Zero)')
  })

  it('tries the highest run level first and falls back to limited', () => {
    const script = buildRegisterScript({ name: WATCHDOG_TASK, execute: 'powershell.exe', argument: '-File x', trigger: 'every-minute', timeLimitMinutes: 2 })
    expect(script.indexOf('-RunLevel Highest')).toBeGreaterThan(-1)
    expect(script.indexOf('-RunLevel Limited')).toBeGreaterThan(script.indexOf('-RunLevel Highest'))
    expect(script).toContain('-RepetitionInterval (New-TimeSpan -Minutes 1)')
    expect(script).toContain('-ExecutionTimeLimit (New-TimeSpan -Minutes 2)')
  })

  it('reports which run level it got, and failure when the task is not there afterwards', async () => {
    expect(await registerTask({ name: 'X', execute: 'a.exe', trigger: 'at-logon', timeLimitMinutes: 0 }, fakeExecFile('highest\r\n'))).toMatchObject({ ok: true, runLevel: 'highest' })
    expect(await registerTask({ name: 'X', execute: 'a.exe', trigger: 'at-logon', timeLimitMinutes: 0 }, fakeExecFile('limited'))).toMatchObject({ ok: true, runLevel: 'limited' })
    expect(await registerTask({ name: 'X', execute: 'a.exe', trigger: 'at-logon', timeLimitMinutes: 0 }, fakeExecFile('', new Error('exit 1')))).toMatchObject({ ok: false })
  })
})

describe('Wi-Fi healing decisions', () => {
  const t0 = 1_000_000

  it('does nothing while online', () => {
    const d = decideWifi(INITIAL_WIFI_STATE, true, t0)
    expect(d).toMatchObject({ transition: null, restart: false })
  })

  it('notes the loss at once but waits a full minute before restarting the adapter', () => {
    let d = decideWifi(INITIAL_WIFI_STATE, false, t0)
    expect(d).toMatchObject({ transition: 'lost', restart: false })
    d = decideWifi(d.state, false, t0 + OFFLINE_BEFORE_RESTART_MS - 1)
    expect(d.restart).toBe(false)
    d = decideWifi(d.state, false, t0 + OFFLINE_BEFORE_RESTART_MS)
    expect(d).toMatchObject({ transition: null, restart: true })
  })

  it('waits out the cooldown before restarting again while still offline', () => {
    let state: WifiWatchState = { online: false, offlineSince: t0, lastRestartAt: t0 + OFFLINE_BEFORE_RESTART_MS }
    let d = decideWifi(state, false, t0 + OFFLINE_BEFORE_RESTART_MS + 10_000)
    expect(d.restart).toBe(false)
    state = d.state
    d = decideWifi(state, false, t0 + OFFLINE_BEFORE_RESTART_MS + RESTART_COOLDOWN_MS)
    expect(d.restart).toBe(true)
  })

  it('reports the restore and starts the offline clock fresh next time', () => {
    const offline: WifiWatchState = { online: false, offlineSince: t0, lastRestartAt: null }
    const d = decideWifi(offline, true, t0 + 5000)
    expect(d).toMatchObject({ transition: 'restored', restart: false, state: { online: true, offlineSince: null } })
    const again = decideWifi(d.state, false, t0 + 6000)
    expect(again.state.offlineSince).toBe(t0 + 6000)
  })
})

describe('respecting a rollback', () => {
  it('on normal starts, a disabled task is left disabled', () => {
    const script = buildRegisterScript({ name: AUTOSTART_TASK, execute: 'a.exe', trigger: 'at-logon', timeLimitMinutes: 0 }, { keepDisabled: true })
    expect(script).toMatch(/State -eq 'Disabled'\) \{ Write-Output 'left-disabled'; exit 0 \}/)
    expect(script.indexOf('left-disabled')).toBeLessThan(script.indexOf('Register-ScheduledTask'))
  })

  it('the admin re-register button overrides it', () => {
    const script = buildRegisterScript({ name: AUTOSTART_TASK, execute: 'a.exe', trigger: 'at-logon', timeLimitMinutes: 0 })
    expect(script).not.toContain('left-disabled')
  })

  it('reports a task left off as fine, not as a failure', async () => {
    const result = await registerTask({ name: 'X', execute: 'a.exe', trigger: 'at-logon', timeLimitMinutes: 0 }, fakeExecFile('left-disabled'), { keepDisabled: true })
    expect(result).toMatchObject({ ok: true, runLevel: 'left-disabled' })
  })
})
