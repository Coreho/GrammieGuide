import { describe, expect, it } from 'vitest'
import {
  pickTapReaction,
  TAP_REACTIONS,
  type TapReaction
} from '../../src/shared/buddy/tapReactions'
import { buddyCommandSchema } from '../../src/shared/buddy/commands'

describe('tap reactions', () => {
  it('uses only waves and hearts in reduced motion, keeping matching lines and avoiding repeats', () => {
    for (const random of [() => 0, () => 0.5, () => 0.99]) {
      let previous: TapReaction | null = TAP_REACTIONS[3]!
      for (let i = 0; i < 20; i++) {
        const reaction = pickTapReaction(previous, random, 'reduced')
        expect(['wave', 'heart']).toContain(reaction.clip)
        expect(TAP_REACTIONS).toContainEqual(reaction)
        expect(reaction.clip).not.toBe(previous?.clip)
        expect(reaction.text).not.toBe(previous?.text)
        previous = reaction
      }
    }
  })
  it('pairs every line with a valid happy gesture and never asks for an answer', () => {
    for (const reaction of TAP_REACTIONS) {
      expect(buddyCommandSchema.safeParse(reaction).success).toBe(true)
      expect(reaction.text).not.toContain('?')
    }
  })

  it('never repeats either the previous line or clip, even with fixed randomness', () => {
    for (const random of [() => 0, () => 0.5, () => 0.999999]) {
      let previous: TapReaction | null = null
      for (let tap = 0; tap < 100; tap++) {
        const reaction = pickTapReaction(previous, random)
        expect(reaction.text).not.toBe(previous?.text)
        expect(reaction.clip).not.toBe(previous?.clip)
        previous = reaction
      }
    }
  })

  it('can select every reaction', () => {
    const picked = TAP_REACTIONS.map((_, i) =>
      pickTapReaction(null, () => i / TAP_REACTIONS.length)
    )
    expect(picked).toEqual(TAP_REACTIONS)
  })
})
