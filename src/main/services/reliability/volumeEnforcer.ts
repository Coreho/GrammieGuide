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

/**
 * `quiet`: the 30s background loop only logs when it actually lowered the
 * volume or something failed - a routine "was fine" every 30s would push
 * everything else out of the 500-entry reliability log within hours. The
 * admin panel's test button leaves it off so it always gets an entry back.
 */
export async function enforceVolumeCeiling(
  ceilingPercent: number,
  resourcesDir: string,
  execFileImpl?: ExecFileFn,
  opts: { quiet?: boolean } = {}
): Promise<void> {
  const loudness = await getLoudness()
  if (loudness) {
    try {
      const current = await loudness.getVolume()
      const lowered = current > ceilingPercent
      if (lowered) {
        await loudness.setVolume(ceilingPercent)
      }
      if (lowered || !opts.quiet) {
        logReliabilityEvent({
          op: 'volume-enforce-loudness',
          ok: true,
          detail: lowered ? `lowered from ${current} to ${ceilingPercent}` : `was ${current}`
        })
      }
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

  const result = await runPowerShell(volumeFallbackScript(csSource, ceilingPercent), {
    execFileImpl
  })
  logReliabilityEvent({
    op: 'volume-enforce-powershell',
    ok: result.ok,
    detail: result.ok ? undefined : (result.error ?? result.stderr),
    durationMs: result.durationMs
  })
}

/**
 * Compiles the helper in memory on every call. The old app cached the DLL at a
 * fixed %TEMP% path and loaded whatever file was there, so any process running
 * as her could plant code for an elevated run to execute. A hash of the source
 * in the file name doesn't help: the source ships with the app, so the name is
 * still predictable. Compiling takes about half a second, and this path only
 * runs when the loudness module has failed.
 */
export function volumeFallbackScript(csSource: string, ceilingPercent: number): string {
  return `
$src = @'
${csSource}
'@
Add-Type -TypeDefinition $src -Language CSharp
[GrammieGuide.VolumeHelper]::EnforceCeiling(${ceilingPercent})
`.trim()
}
