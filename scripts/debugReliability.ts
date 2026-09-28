// Manual real-hardware verification harness for the reliability layer.
// Run with: npx tsx scripts/debugReliability.ts
// Deliberately does NOT force a volume change (only reads current volume)
// and removes its test scheduled tasks after running the watchdog once
// against a throwaway folder - safe to re-run on a live machine. Don't run
// it on a kiosk where GrammieGuide is installed: it replaces (then removes)
// the real autostart and watchdog tasks.

import { discoverWifiAdapterName } from '../src/main/services/reliability/wifiHealer'
import { registerWatchdogTask, registerAutostartTask } from '../src/main/services/reliability/watchdog'
import { AUTOSTART_TASK, WATCHDOG_TASK, unregisterTask } from '../src/main/services/reliability/scheduledTasks'
import { runPowerShell } from '../src/main/services/reliability/shellExec'
import { getReliabilityLog } from '../src/main/services/reliability/reliabilityLog'
import { isOnline } from '../src/main/services/reliability/wifiWatch'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, writeFileSync, utimesSync, readFileSync, existsSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  console.log('--- Wi-Fi adapter discovery (read-only) ---')
  const adapterName = await discoverWifiAdapterName()
  console.log('discovered adapter name:', adapterName)
  console.log('connectivity probe says online:', await isOnline())

  console.log('\n--- loudness native module (read-only volume check) ---')
  try {
    const loudness = require('loudness') as typeof import('loudness')
    const current = await loudness.getVolume()
    console.log('loudness.getVolume() succeeded, current system volume:', current)
  } catch (err) {
    console.log('loudness module failed to load/read volume:', String(err))
    console.log('(this just means the code will fall back to the PowerShell/C# path - not tested here to avoid a real volume change without asking first)')
  }

  console.log('\n--- Scheduled tasks: register, run the watchdog once, then clean up ---')
  // A throwaway folder with a heartbeat that is already 10 minutes stale and
  // an exe that doesn't exist: one run of the watchdog must then log
  // "hang detected" and a failed relaunch - proof the script really executes
  // under Task Scheduler (execution policy included), not just registers.
  const dir = mkdtempSync(join(tmpdir(), 'grammieguide-debug-'))
  const heartbeatPath = join(dir, 'heartbeat.txt')
  writeFileSync(heartbeatPath, '0')
  const stale = new Date(Date.now() - 10 * 60_000)
  utimesSync(heartbeatPath, stale, stale)
  const watchdogScriptPath = join(process.cwd(), 'resources', 'watchdog', 'watchdog.ps1')
  const fakeExePath = join(dir, 'grammieguide-debug-fake.exe')
  console.log('registerAutostartTask():', await registerAutostartTask(fakeExePath))
  console.log('registerWatchdogTask():', await registerWatchdogTask(watchdogScriptPath, heartbeatPath, fakeExePath))

  const settings = await runPowerShell(
    `Get-ScheduledTask -TaskName '${AUTOSTART_TASK}','${WATCHDOG_TASK}' | ForEach-Object { "$($_.TaskName): runLevel=$($_.Principal.RunLevel) timeLimit=$($_.Settings.ExecutionTimeLimit)" }`
  )
  console.log(settings.stdout.trim())

  await runPowerShell(`Start-ScheduledTask -TaskName '${WATCHDOG_TASK}'`)
  const log = join(dir, 'safety-events.log')
  for (let i = 0; i < 30 && !existsSync(log); i++) await sleep(500)
  await sleep(3000)
  console.log('watchdog run produced:\n' + (existsSync(log) ? readFileSync(log, 'utf8').trim() : '(nothing - the script did not run)'))

  console.log('cleaning up test tasks...')
  const cleaned = (await unregisterTask(AUTOSTART_TASK)) && (await unregisterTask(WATCHDOG_TASK))
  console.log('cleanup ok:', cleaned)

  console.log('\n--- Reliability log ---')
  for (const event of getReliabilityLog(20)) {
    console.log(event)
  }
}

main().catch((err) => {
  console.error('debug harness crashed:', err)
  process.exit(1)
})
