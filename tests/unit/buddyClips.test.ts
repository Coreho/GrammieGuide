import { describe, it, expect } from 'vitest'
import { pickClip, loopsFor, restingLoop } from '../../src/renderer/launcher/src/buddy/clips'
import type { BuddyActivity } from '../../src/shared/buddy/buddyMachine'

const ALL: BuddyActivity[] = [
  'greeting', 'resting', 'fidgeting', 'strolling', 'remarking', 'farewell',
  'chat.hello', 'chat.attending', 'chat.hearing', 'chat.thinking', 'chat.talking', 'chat.petted'
]

describe('buddy clips', () => {
  it('has a clip for every activity', () => {
    for (const activity of ALL) expect(pickClip(activity, { random: Math.random })).toBeTruthy()
  })

  it('one-shot activities never loop, so they always report back', () => {
    for (const activity of ['greeting', 'fidgeting', 'remarking', 'farewell', 'chat.hello', 'chat.talking', 'chat.petted'] as const) {
      expect(loopsFor(activity)).toBe(false)
    }
    expect(loopsFor('resting')).toBe(true)
    expect(loopsFor('chat.thinking')).toBe(true)
  })

  it('does not repeat the last fidget when there is another choice', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(pickClip('fidgeting', { random: () => r, last: 'look_around' })).not.toBe('look_around')
    }
  })

  it('keeps night fidgets quiet', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(['idle_soft', 'look_around']).toContain(pickClip('fidgeting', { random: () => r, night: true }))
    }
  })

  it('settles into listening during chat and idling otherwise', () => {
    expect(restingLoop('chat.talking')).toBe('listen')
    expect(restingLoop('fidgeting')).toBe('idle_calm')
  })
})
