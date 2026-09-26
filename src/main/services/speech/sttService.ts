import type { BuddyListenResult } from '@shared/ipcContract'
import { runPowerShell, type ShellResult } from '../reliability/shellExec'

/**
 * Speech in, via Windows' own offline recognizer (System.Speech). The old
 * app used the browser's webkitSpeechRecognition, which in Electron needs
 * Google API keys and so never actually worked on the kiosk. This needs no
 * network and no key; it goes through runPowerShell like every other
 * PowerShell call.
 *
 * One call = one phrase: Recognize() returns when she stops talking
 * (EndSilenceTimeout), or gives up if she never starts (InitialSilenceTimeout).
 * Scripts print one line of JSON so the parsing below never has to guess.
 */

type Run = (script: string, opts?: { timeoutMs?: number }) => Promise<ShellResult>

// Dictation hears noise as words; below this it's more likely a cough than a sentence.
export const MIN_CONFIDENCE = 0.1

const SETUP = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Out($o) { [Console]::Out.Write(($o | ConvertTo-Json -Compress)) }
try { Add-Type -AssemblyName System.Speech } catch { Out @{ status = 'no-recognizer' }; exit }
$info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1
if (-not $info) { Out @{ status = 'no-recognizer' }; exit }
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
try { $engine.SetInputToDefaultAudioDevice() } catch { Out @{ status = 'no-mic' }; exit }
`

export const CAN_LISTEN_SCRIPT = `${SETUP}
$engine.Dispose()
Out @{ status = 'ok' }
`

export const LISTEN_SCRIPT = `${SETUP}
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(4)
$engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
$result = $engine.Recognize([TimeSpan]::FromSeconds(25))
$engine.Dispose()
if ($result -and $result.Text) { Out @{ status = 'ok'; text = $result.Text; confidence = $result.Confidence } }
else { Out @{ status = 'nothing' } }
`

type ScriptOutput = { status?: string; text?: unknown; confidence?: unknown }

function parse(result: ShellResult): ScriptOutput | null {
  if (!result.ok) return null
  try {
    const out = JSON.parse(result.stdout.trim()) as unknown
    return typeof out === 'object' && out !== null ? (out as ScriptOutput) : null
  } catch {
    return null
  }
}

export async function listenOnce(run: Run = runPowerShell): Promise<BuddyListenResult> {
  const out = parse(await run(LISTEN_SCRIPT, { timeoutMs: 35_000 }))
  if (!out) return { ok: false, reason: 'unavailable' }
  if (out.status === 'no-mic') return { ok: false, reason: 'no-mic' }
  if (out.status !== 'ok') return { ok: false, reason: out.status === 'nothing' ? 'nothing-heard' : 'unavailable' }
  const text = typeof out.text === 'string' ? out.text.trim() : ''
  const confidence = typeof out.confidence === 'number' ? out.confidence : 1
  if (!text || confidence < MIN_CONFIDENCE) return { ok: false, reason: 'nothing-heard' }
  return { ok: true, text }
}

export async function canListen(run: Run = runPowerShell): Promise<boolean> {
  return parse(await run(CAN_LISTEN_SCRIPT, { timeoutMs: 15_000 }))?.status === 'ok'
}
