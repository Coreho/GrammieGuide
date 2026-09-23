// Manual real-hardware verification harness for M1's reliability layer.
// Run with: npx tsx scripts/debugReliability.ts
// Deliberately does NOT force a volume change (only reads current volume)
// and cleans up its own test scheduled task after verifying registration -
// this is meant to be safe to re-run on a live machine.

import { discoverWifiAdapterName } from '../src/main/services/reliability/wifiHealer'
import { registerWatchdogTask } from '../src/main/services/reliability/watchdog'
import { runPowerShell } from '../src/main/services/reliability/shellExec'
import { getReliabilityLog } from '../src/main/services/reliability/reliabilityLog'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

async function main(): Promise<void> {
  console.log('--- Wi-Fi adapter discovery (read-only) ---')
  const adapterName = await discoverWifiAdapterName()
  console.log('discovered adapter name:', adapterName)

  console.log('\n--- loudness native module (read-only volume check) ---')
  try {
    const loudness = require('loudness') as typeof import('loudness')
    const current = await loudness.getVolume()
    console.log('loudness.getVolume() succeeded, current system volume:', current)
  } catch (err) {
    console.log('loudness module failed to load/read volume:', String(err))
    console.log('(this just means the code will fall back to the PowerShell/C# path - not tested here to avoid a real volume change without asking first)')
  }

  console.log('\n--- Watchdog scheduled task: register, verify, then clean up ---')
  const heartbeatPath = join(tmpdir(), 'grammieguide-debug-heartbeat.txt')
  const watchdogScriptPath = join(process.cwd(), 'resources', 'watchdog', 'watchdog.ps1')
  const fakeExePath = join(tmpdir(), 'grammieguide-debug-fake.exe')
  const registered = await registerWatchdogTask(watchdogScriptPath, heartbeatPath, fakeExePath)
  console.log('registerWatchdogTask() reported:', registered)

  console.log('cleaning up test task...')
  const cleanup = await runPowerShell(
    "Unregister-ScheduledTask -TaskName 'GrammieGuideWatchdog' -Confirm:$false -ErrorAction SilentlyContinue"
  )
  console.log('cleanup ok:', cleanup.ok)

  console.log('\n--- Reliability log ---')
  for (const event of getReliabilityLog(20)) {
    console.log(event)
  }
}

main().catch((err) => {
  console.error('debug harness crashed:', err)
  process.exit(1)
})
