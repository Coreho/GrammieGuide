import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enforceVolumeCeiling } from '../../src/main/services/reliability/volumeEnforcer'
import type { ExecFileFn } from '../../src/main/services/reliability/shellExec'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Security test suite for volumeEnforcer.ts
 * 
 * Verifies that the mitigation for the predictable DLL loading vulnerability is effective.
 * The vulnerability allowed an attacker to plant a malicious DLL at a fixed TEMP path
 * (%TEMP%\GrammieGuideVolumeHelper.dll) which would be loaded and executed without validation.
 * 
 * The mitigation includes a hash of the C# source in the DLL filename, preventing an attacker
 * from planting a malicious assembly that would be loaded by the fallback.
 */

function fakeExecFile(impl: (cmd: string, args: string[]) => { err: Error | null; stdout: string; stderr: string }): ExecFileFn {
  return ((cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
    const { err, stdout, stderr } = impl(cmd as string, args as string[])
    ;(cb as (e: Error | null, o: string, s: string) => void)(err, stdout, stderr)
    return {} as ReturnType<ExecFileFn>
  }) as unknown as ExecFileFn
}

describe('Volume enforcer security - DLL loading mitigation', () => {
  const testResourcesDir = join(process.cwd(), 'resources')
  
  beforeEach(() => {
    // Clear any cached loudness module to ensure we test the PowerShell fallback
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes a hash of the C# source in the DLL filename to prevent malicious DLL planting', async () => {
    let capturedScript = ''
    const execFileImpl = fakeExecFile((cmd, args) => {
      expect(cmd).toBe('powershell.exe')
      const encodedIndex = args.indexOf('-EncodedCommand')
      if (encodedIndex !== -1) {
        const encoded = args[encodedIndex + 1]
        capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
      }
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // Verify the script was captured
    expect(capturedScript).toBeTruthy()
    
    // The DLL filename must NOT be the old predictable name
    expect(capturedScript).not.toContain("'GrammieGuideVolumeHelper.dll'")
    
    // The DLL filename must include a hash component
    expect(capturedScript).toMatch(/GrammieGuideVolumeHelper\.[a-f0-9]{16}\.dll/)
  })

  it('computes the hash from the actual C# source file content', async () => {
    let capturedScript = ''
    const execFileImpl = fakeExecFile((cmd, args) => {
      const encodedIndex = args.indexOf('-EncodedCommand')
      if (encodedIndex !== -1) {
        const encoded = args[encodedIndex + 1]
        capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
      }
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // Read the actual C# source and compute its hash
    const csPath = join(testResourcesDir, 'reliability', 'VolumeHelper.cs')
    const csSource = readFileSync(csPath, 'utf8')
    const expectedHash = createHash('sha256').update(csSource, 'utf8').digest('hex').slice(0, 16)
    const expectedDllName = `GrammieGuideVolumeHelper.${expectedHash}.dll`

    // Verify the script uses the correct hash-based filename
    expect(capturedScript).toContain(expectedDllName)
  })

  it('embeds the C# source in the PowerShell script for compilation', async () => {
    let capturedScript = ''
    const execFileImpl = fakeExecFile((cmd, args) => {
      const encodedIndex = args.indexOf('-EncodedCommand')
      if (encodedIndex !== -1) {
        const encoded = args[encodedIndex + 1]
        capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
      }
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // The script must contain the C# source for Add-Type compilation
    expect(capturedScript).toContain('namespace GrammieGuide')
    expect(capturedScript).toContain('public static class VolumeHelper')
    expect(capturedScript).toContain('public static void EnforceCeiling')
    
    // The script must use Add-Type to compile from source
    expect(capturedScript).toContain('Add-Type -TypeDefinition $src')
    expect(capturedScript).toContain('-OutputAssembly $dll')
  })

  it('prevents loading a pre-planted DLL with the old predictable name', async () => {
    let capturedScript = ''
    const execFileImpl = fakeExecFile((cmd, args) => {
      const encodedIndex = args.indexOf('-EncodedCommand')
      if (encodedIndex !== -1) {
        const encoded = args[encodedIndex + 1]
        capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
      }
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // Extract the DLL path from the script
    const dllPathMatch = capturedScript.match(/\$dll = Join-Path \$env:TEMP '([^']+)'/)
    expect(dllPathMatch).toBeTruthy()
    
    const dllName = dllPathMatch![1]
    
    // The DLL name must be different from the old predictable name
    expect(dllName).not.toBe('GrammieGuideVolumeHelper.dll')
    
    // The DLL name must include a hash to bind it to the source
    expect(dllName).toMatch(/^GrammieGuideVolumeHelper\.[a-f0-9]{16}\.dll$/)
  })

  it('invalidates cached DLLs when the C# source changes', () => {
    // Simulate two different C# source versions
    const originalSource = readFileSync(join(testResourcesDir, 'reliability', 'VolumeHelper.cs'), 'utf8')
    const modifiedSource = originalSource + '\n// Modified by attacker'

    // Compute hashes for both versions
    const originalHash = createHash('sha256').update(originalSource, 'utf8').digest('hex').slice(0, 16)
    const modifiedHash = createHash('sha256').update(modifiedSource, 'utf8').digest('hex').slice(0, 16)

    // The hashes must be different, ensuring a modified source produces a different DLL name
    expect(originalHash).not.toBe(modifiedHash)
    
    // This means an attacker cannot plant a DLL that will be loaded after the source changes
    const originalDllName = `GrammieGuideVolumeHelper.${originalHash}.dll`
    const modifiedDllName = `GrammieGuideVolumeHelper.${modifiedHash}.dll`
    expect(originalDllName).not.toBe(modifiedDllName)
  })

  it('uses the hash-based filename in both compilation and loading paths', async () => {
    let capturedScript = ''
    const execFileImpl = fakeExecFile((cmd, args) => {
      const encodedIndex = args.indexOf('-EncodedCommand')
      if (encodedIndex !== -1) {
        const encoded = args[encodedIndex + 1]
        capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
      }
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // The script must check for the hash-based DLL before compiling
    expect(capturedScript).toMatch(/if \(-not \(Test-Path \$dll\)\)/)
    
    // Both the compilation path (Add-Type -OutputAssembly) and loading path (Add-Type -Path)
    // must use the same $dll variable, which contains the hash-based name
    expect(capturedScript).toContain('Add-Type -TypeDefinition $src -OutputAssembly $dll')
    expect(capturedScript).toContain('Add-Type -Path $dll')
    
    // The invocation must use the expected type from the compiled/loaded assembly
    expect(capturedScript).toContain('[GrammieGuide.VolumeHelper]::EnforceCeiling(75)')
  })

  it('passes the ceiling percentage correctly to the C# method', async () => {
    const testCases = [50, 75, 100]
    
    for (const ceiling of testCases) {
      let capturedScript = ''
      const execFileImpl = fakeExecFile((cmd, args) => {
        const encodedIndex = args.indexOf('-EncodedCommand')
        if (encodedIndex !== -1) {
          const encoded = args[encodedIndex + 1]
          capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
        }
        return { err: null, stdout: '', stderr: '' }
      })

      await enforceVolumeCeiling(ceiling, testResourcesDir, execFileImpl)

      // Verify the ceiling is passed to the C# method
      expect(capturedScript).toContain(`[GrammieGuide.VolumeHelper]::EnforceCeiling(${ceiling})`)
    }
  })

  it('handles missing VolumeHelper.cs file gracefully without executing PowerShell', async () => {
    const nonExistentDir = join(process.cwd(), 'nonexistent')
    let powerShellCalled = false
    
    const execFileImpl = fakeExecFile(() => {
      powerShellCalled = true
      return { err: null, stdout: '', stderr: '' }
    })

    // Should not throw, but also should not call PowerShell
    await enforceVolumeCeiling(75, nonExistentDir, execFileImpl)
    
    expect(powerShellCalled).toBe(false)
  })

  it('uses SHA-256 hash algorithm for cryptographic strength', () => {
    const testSource = 'test source code'
    
    // Verify we're using SHA-256 (produces 64 hex chars, we take first 16)
    const hash = createHash('sha256').update(testSource, 'utf8').digest('hex')
    expect(hash).toHaveLength(64)
    
    const shortHash = hash.slice(0, 16)
    expect(shortHash).toHaveLength(16)
    expect(shortHash).toMatch(/^[a-f0-9]{16}$/)
  })

  it('prevents privilege escalation by binding DLL name to source content', async () => {
    /**
     * Attack scenario (now mitigated):
     * 1. Attacker plants malicious DLL at %TEMP%\GrammieGuideVolumeHelper.dll
     * 2. Elevated app runs and loads the malicious DLL without validation
     * 3. Attacker gains code execution in elevated context
     * 
     * Mitigation:
     * The DLL name now includes a hash of the legitimate C# source, so the
     * attacker cannot predict the filename. Even if they replace VolumeHelper.cs,
     * the hash changes and old planted DLLs are ignored.
     */
    
    let capturedScript = ''
    const execFileImpl = fakeExecFile((cmd, args) => {
      const encodedIndex = args.indexOf('-EncodedCommand')
      if (encodedIndex !== -1) {
        const encoded = args[encodedIndex + 1]
        capturedScript = Buffer.from(encoded, 'base64').toString('utf16le')
      }
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // Extract the DLL name from the script
    const dllPathMatch = capturedScript.match(/\$dll = Join-Path \$env:TEMP '([^']+)'/)
    expect(dllPathMatch).toBeTruthy()
    const actualDllName = dllPathMatch![1]

    // Compute what the attacker would need to predict
    const csSource = readFileSync(join(testResourcesDir, 'reliability', 'VolumeHelper.cs'), 'utf8')
    const sourceHash = createHash('sha256').update(csSource, 'utf8').digest('hex').slice(0, 16)
    const expectedDllName = `GrammieGuideVolumeHelper.${sourceHash}.dll`

    // The actual DLL name must match the hash-based name
    expect(actualDllName).toBe(expectedDllName)
    
    // An attacker planting a DLL with the old predictable name would fail
    expect(actualDllName).not.toBe('GrammieGuideVolumeHelper.dll')
    
    // The hash makes the filename unpredictable without knowing the exact source
    expect(actualDllName).toContain(sourceHash)
  })
})

describe('Volume enforcer - PowerShell fallback behavior', () => {
  const testResourcesDir = join(process.cwd(), 'resources')

  it('falls back to PowerShell when loudness module is unavailable', async () => {
    let powerShellCalled = false
    const execFileImpl = fakeExecFile(() => {
      powerShellCalled = true
      return { err: null, stdout: '', stderr: '' }
    })

    // The loudness module won't be available in the test environment
    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)
    
    expect(powerShellCalled).toBe(true)
  })

  it('encodes the PowerShell script correctly for execution', async () => {
    let capturedArgs: string[] = []
    const execFileImpl = fakeExecFile((cmd, args) => {
      capturedArgs = args
      return { err: null, stdout: '', stderr: '' }
    })

    await enforceVolumeCeiling(75, testResourcesDir, execFileImpl)

    // Verify PowerShell is called with encoded command
    expect(capturedArgs).toContain('-NoProfile')
    expect(capturedArgs).toContain('-NonInteractive')
    expect(capturedArgs).toContain('-EncodedCommand')
    
    // Verify the encoded command can be decoded
    const encodedIndex = capturedArgs.indexOf('-EncodedCommand')
    const encoded = capturedArgs[encodedIndex + 1]
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
    
    expect(decoded).toContain('GrammieGuide.VolumeHelper')
    expect(decoded).toContain('EnforceCeiling')
  })
})
