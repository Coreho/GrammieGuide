import { execFile, type ExecFileException } from 'child_process'

export type ShellResult = {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  error?: string
}

export type ExecFileFn = typeof execFile

/**
 * The single place any PowerShell command is run from. Everything the old
 * app's reliability code did with raw exec() + hand-built strings/base64
 * (watchdog.js, index.js's volume/wifi handlers) goes through here instead,
 * so there is exactly one place that:
 *   - always encodes the script as UTF-16LE base64 -EncodedCommand (never
 *     naive string interpolation into a shell command line - that's the
 *     pattern being retired, e.g. the old
 *     `exec('powershell ... -Command "Restart-NetAdapter -Name ' + name + '"')`)
 *   - uses execFile, not exec, so PowerShell's own argv parsing is the only
 *     shell involved (no extra cmd.exe shell layer to escape through)
 *   - times every call and returns a structured result instead of leaving
 *     callers to console.warn and move on
 *   - takes an injectable execFile implementation so tests never spawn a
 *     real shell
 */
export function runPowerShell(
  script: string,
  opts: { timeoutMs?: number; execFileImpl?: ExecFileFn } = {}
): Promise<ShellResult> {
  const timeoutMs = opts.timeoutMs ?? 15000
  const execImpl = opts.execFileImpl ?? execFile
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const start = Date.now()

  return new Promise((resolvePromise) => {
    execImpl(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-EncodedCommand',
        encoded
      ],
      { timeout: timeoutMs, windowsHide: true },
      (err: ExecFileException | null, stdout: string, stderr: string) => {
        const durationMs = Date.now() - start
        if (err) {
          resolvePromise({
            ok: false,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            exitCode: typeof err.code === 'number' ? err.code : null,
            durationMs,
            error: err.message
          })
          return
        }
        resolvePromise({
          ok: true,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: 0,
          durationMs
        })
      }
    )
  })
}

/** Exposed only so tests can assert on the exact payload without spawning powershell. */
export function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}
