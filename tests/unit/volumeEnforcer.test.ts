import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { volumeFallbackScript } from '../../src/main/services/reliability/volumeEnforcer'

// The script builder is tested directly: calling enforceVolumeCeiling() here
// would use the real loudness module on a Windows dev machine and change its
// volume instead of reaching the PowerShell fallback.
const csSource = readFileSync(
  join(process.cwd(), 'resources', 'reliability', 'VolumeHelper.cs'),
  'utf8'
)

describe('volumeFallbackScript', () => {
  const script = volumeFallbackScript(csSource, 75)

  it('compiles the shipped C# source in memory', () => {
    expect(script).toContain(csSource)
    expect(script).toContain('Add-Type -TypeDefinition $src -Language CSharp')
    expect(script).toContain('[GrammieGuide.VolumeHelper]::EnforceCeiling(75)')
  })

  it('never writes or loads a cached DLL that another process could replace', () => {
    const wrapper = script.replace(csSource, '')
    expect(wrapper).not.toMatch(/-OutputAssembly|Add-Type\s+-Path|\.dll|\$env:TEMP/i)
  })
})
