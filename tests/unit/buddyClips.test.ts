import { describe, it, expect } from 'vitest'
import { pickClip, loopsFor, restingLoop } from '../../src/renderer/launcher/src/buddy/clips'
import type { BuddyActivity } from '../../src/shared/buddy/buddyMachine'

const ALL: BuddyActivity[] = [
  'commanded',
  'greeting',
  'resting',
  'fidgeting',
  'strolling',
  'remarking',
  'farewell',
  'chat.hello',
  'chat.attending',
  'chat.hearing',
  'chat.thinking',
  'chat.talking',
  'chat.petted'
]

describe('buddy clips', () => {
  it('uses only the smaller gesture set in reduced motion, during day and night', () => {
    const expected: Partial<Record<BuddyActivity, string>> = {
      greeting: 'wave',
      resting: 'idle_calm',
      fidgeting: 'idle_calm',
      remarking: 'idle_calm',
      farewell: 'wave',
      'chat.hello': 'wave',
      'chat.attending': 'listen',
      'chat.hearing': 'listen',
      'chat.thinking': 'listen',
      'chat.talking': 'talk',
      'chat.petted': 'heart'
    }
    for (const night of [true, false]) {
      for (const [activity, clip] of Object.entries(expected)) {
        for (const random of [() => 0, () => 0.5, () => 0.99]) {
          expect(pickClip(activity as BuddyActivity, { motion: 'reduced', night, random })).toBe(
            clip
          )
        }
      }
    }
  })

  it('preserves the usual gesture pools for still and roam', () => {
    for (const activity of ALL) {
      for (const motion of ['still', 'roam'] as const) {
        for (const random of [() => 0, () => 0.5, () => 0.99]) {
          expect(pickClip(activity, { motion, random })).toBe(pickClip(activity, { random }))
        }
      }
    }
  })
  it('has a clip for every activity', () => {
    for (const activity of ALL) expect(pickClip(activity, { random: Math.random })).toBeTruthy()
  })

  it('one-shot activities never loop, so they always report back', () => {
    for (const activity of [
      'commanded',
      'greeting',
      'fidgeting',
      'remarking',
      'farewell',
      'chat.hello',
      'chat.talking',
      'chat.petted'
    ] as const) {
      expect(loopsFor(activity)).toBe(false)
    }
    expect(loopsFor('resting')).toBe(true)
    expect(loopsFor('chat.thinking')).toBe(true)
  })

  it('does not repeat the last fidget when there is another choice', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(pickClip('fidgeting', { random: () => r, last: 'look_around' })).not.toBe(
        'look_around'
      )
    }
  })

  it('keeps night fidgets quiet', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(['idle_soft', 'look_around']).toContain(
        pickClip('fidgeting', { random: () => r, night: true })
      )
    }
  })

  it('settles into listening during chat and idling otherwise', () => {
    expect(restingLoop('chat.talking')).toBe('listen')
    expect(restingLoop('fidgeting')).toBe('idle_calm')
  })
})
