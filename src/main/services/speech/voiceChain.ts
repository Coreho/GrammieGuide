import type { BuddySpeakResult } from '@shared/ipcContract'

/**
 * Which voice says Buddy's line: the online Edge voice when the caregiver
 * has it on, then the voice on this computer, and if neither works the
 * renderer's Windows voice (any ok:false). The admin preview and voice check
 * name one path to hear just that voice, and only those wait for the local
 * model to load; an ordinary line never does.
 */
export async function speakLine(opts: {
  path?: 'online' | 'local'
  cloudTtsEnabled: boolean
  online: () => Promise<BuddySpeakResult>
  local: (wait: boolean) => Promise<BuddySpeakResult>
  log: (type: string) => void
}): Promise<BuddySpeakResult> {
  if (opts.path === 'local') return opts.local(true)
  if (opts.path === 'online' || opts.cloudTtsEnabled) {
    if (!opts.cloudTtsEnabled) return { ok: false, reason: 'disabled' }
    const online = await opts.online()
    if (online.ok || online.reason === 'empty' || opts.path === 'online') return online
    opts.log('buddy-voice-unavailable')
  }
  return opts.local(false)
}
