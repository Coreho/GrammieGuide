import { runPowerShell, type ExecFileFn } from './shellExec'
import { logReliabilityEvent } from './reliabilityLog'

/**
 * The old app hardcoded `Restart-NetAdapter -Name 'Wi-Fi'` (src/main/index.js:387),
 * which silently no-ops (`-ErrorAction SilentlyContinue`) on any machine
 * where the adapter isn't literally named "Wi-Fi". This discovers the real
 * adapter by physical media type instead of assuming a display name.
 */
const DISCOVER_SCRIPT = `
$adapter = Get-NetAdapter -Physical | Where-Object { $_.PhysicalMediaType -match '802\\.11' -and $_.Status -eq 'Up' } | Select-Object -First 1
if (-not $adapter) {
  $adapter = Get-NetAdapter -Physical | Where-Object { $_.PhysicalMediaType -match '802\\.11' } | Select-Object -First 1
}
if ($adapter) { Write-Output $adapter.Name } else { exit 1 }
`.trim()

export async function discoverWifiAdapterName(
  execFileImpl?: ExecFileFn
): Promise<string | null> {
  const result = await runPowerShell(DISCOVER_SCRIPT, { execFileImpl })
  logReliabilityEvent({
    op: 'wifi-adapter-discovery',
    ok: result.ok,
    detail: result.ok ? result.stdout.trim() : result.error ?? result.stderr,
    durationMs: result.durationMs
  })
  if (!result.ok) return null
  const name = result.stdout.trim()
  return name.length > 0 ? name : null
}

export async function restartWifiAdapter(
  adapterName: string,
  execFileImpl?: ExecFileFn
): Promise<boolean> {
  const script = `Restart-NetAdapter -Name '${adapterName.replace(/'/g, "''")}' -ErrorAction Stop`
  const result = await runPowerShell(script, { execFileImpl })
  logReliabilityEvent({
    op: 'wifi-adapter-restart',
    ok: result.ok,
    detail: result.ok ? adapterName : result.error ?? result.stderr,
    durationMs: result.durationMs
  })
  return result.ok
}

/**
 * Resolves the adapter to heal: use the cached name if given, but re-discover
 * if it's missing or the caller signals it no longer resolves (renamed
 * adapter, driver reinstall, etc.).
 */
export async function resolveWifiAdapterName(
  cachedName: string | undefined,
  execFileImpl?: ExecFileFn
): Promise<string | null> {
  if (cachedName) return cachedName
  return discoverWifiAdapterName(execFileImpl)
}
