import { describe, it, expect } from 'vitest'
import { runPowerShell, encodeCommand } from '../../src/main/services/reliability/shellExec'
import type { ExecFileFn } from '../../src/main/services/reliability/shellExec'

function fakeExecFile(impl: (cmd: string, args: string[]) => { err: Error | null; stdout: string; stderr: string }): ExecFileFn {
  return ((cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
    const { err, stdout, stderr } = impl(cmd as string, args as string[])
    ;(cb as (e: Error | null, o: string, s: string) => void)(err, stdout, stderr)
    return {} as ReturnType<ExecFileFn>
  }) as unknown as ExecFileFn
}

describe('encodeCommand', () => {
  it('encodes as UTF-16LE base64, matching what powershell -EncodedCommand expects', () => {
    const encoded = encodeCommand('Write-Output "hi"')
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(decoded).toBe('Write-Output "hi"')
  })
})

describe('runPowerShell', () => {
  it('calls powershell.exe with -EncodedCommand carrying the exact encoded script', async () => {
    let capturedArgs: string[] = []
    const execFileImpl = fakeExecFile((cmd, args) => {
      capturedArgs = args
      expect(cmd).toBe('powershell.exe')
      return { err: null, stdout: 'ok', stderr: '' }
    })

    const result = await runPowerShell('Write-Output "hi"', { execFileImpl })

    expect(result.ok).toBe(true)
    expect(result.stdout).toBe('ok')
    expect(capturedArgs).toContain('-EncodedCommand')
    const encodedArg = capturedArgs[capturedArgs.indexOf('-EncodedCommand') + 1]
    expect(encodedArg).toBe(encodeCommand('Write-Output "hi"'))
  })

  it('surfaces a non-zero exit as ok:false instead of throwing', async () => {
    const execFileImpl = fakeExecFile(() => ({
      err: Object.assign(new Error('exit 1'), { code: 1 }),
      stdout: '',
      stderr: 'boom'
    }))

    const result = await runPowerShell('exit 1', { execFileImpl })

    expect(result.ok).toBe(false)
    expect(result.stderr).toBe('boom')
    expect(result.error).toContain('exit 1')
  })

  it('records duration', async () => {
    const execFileImpl = fakeExecFile(() => ({ err: null, stdout: '', stderr: '' }))
    const result = await runPowerShell('noop', { execFileImpl })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
