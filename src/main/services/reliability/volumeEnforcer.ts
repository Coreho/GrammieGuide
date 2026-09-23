import { readFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { runPowerShell, type ExecFileFn } from './shellExec'
import { logReliabilityEvent } from './reliabilityLog'

const require = createRequire(import.meta.url)

/**
 * First choice: the `loudness` native module (no PowerShell spawn at all).
 * Only if that proves unreliable on real hardware do we fall back to the old
 * app's approach: compile a C# COM-interop payload (IAudioEndpointVolume)
 * via `Add-Type` and invoke it through PowerShell. Unlike the old app
 * (src/main/index.js:218-285), the C# source is a static ASCII resource file
 * (resources/reliability/VolumeHelper.cs) instead of an inline JS template
 * literal, and every call goes through shellExec so compile vs. runtime
 * failures are distinctly logged instead of one swallowed console.warn.
 */

let loudnessModule: typeof import('loudness') | null | undefined

/**
 * `loudness`'s package.json declares no "type": "module" and its .d.ts uses
 * `export =` (a pure CJS default export) - going through `createRequire`
 * instead of a dynamic `import()` avoids depending on Node's CJS/ESM
 * named-export interop detection, which proved unreliable for this package
 * (a plain `await import('loudness')` produced an object with no callable
 * getVolume/setVolume, confirmed against real hardware).
 */
async function getLoudness(): Promise<typeof import('loudness') | null> {
  if (loudnessModule !== undefined) return loudnessModule
  try {
    loudnessModule = require('loudness') as typeof import('loudness')
  } catch {
    loudnessModule = null
  }
  return loudnessModule ?? null
}

export async function enforceVolumeCeiling(
  ceilingPercent: number,
  resourcesDir: string,
  execFileImpl?: ExecFileFn
): Promise<void> {
  const loudness = await getLoudness()
  if (loudness) {
    try {
      const current = await loudness.getVolume()
      if (current > ceilingPercent) {
        await loudness.setVolume(ceilingPercent)
      }
      logReliabilityEvent({ op: 'volume-enforce-loudness', ok: true, detail: `was ${current}` })
      return
    } catch (err) {
      logReliabilityEvent({
        op: 'volume-enforce-loudness',
        ok: false,
        detail: `loudness module threw, falling back to PowerShell: ${String(err)}`
      })
      // fall through to PowerShell fallback below
    }
  }

  await enforceViaPowerShell(ceilingPercent, resourcesDir, execFileImpl)
}

async function enforceViaPowerShell(
  ceilingPercent: number,
  resourcesDir: string,
  execFileImpl?: ExecFileFn
): Promise<void> {
  const csPath = join(resourcesDir, 'reliability', 'VolumeHelper.cs')
  let csSource: string
  try {
    csSource = readFileSync(csPath, 'utf8')
  } catch (err) {
    logReliabilityEvent({
      op: 'volume-enforce-powershell',
      ok: false,
      detail: `could not read VolumeHelper.cs: ${String(err)}`
    })
    return
  }

  const script = `
$src = @'
${csSource}
'@
$dll = Join-Path $env:TEMP 'GrammieGuideVolumeHelper.dll'
if (-not (Test-Path $dll)) {
  Add-Type -TypeDefinition $src -OutputAssembly $dll -Language CSharp
} else {
  Add-Type -Path $dll
}
[GrammieGuide.VolumeHelper]::EnforceCeiling(${ceilingPercent})
`.trim()

  const result = await runPowerShell(script, { execFileImpl })
  logReliabilityEvent({
    op: 'volume-enforce-powershell',
    ok: result.ok,
    detail: result.ok ? undefined : result.error ?? result.stderr,
    durationMs: result.durationMs
  })
}
