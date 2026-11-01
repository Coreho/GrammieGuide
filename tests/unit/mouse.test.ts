import { describe, expect, it } from 'vitest'
import { isDeliberateMouseMove, isRepeatClick } from '../../src/shared/mouse'

describe('the second click of a double-click', () => {
  it('is only the mouse click Windows counted as second or later', () => {
    expect(isRepeatClick({ pointerType: 'mouse', detail: 1 })).toBe(false)
    expect(isRepeatClick({ pointerType: 'mouse', detail: 2 })).toBe(true)
    expect(isRepeatClick({ pointerType: 'mouse', detail: 3 })).toBe(true)
  })

  it('never includes a tap, or a key activating a button', () => {
    expect(isRepeatClick({ pointerType: 'touch', detail: 2 })).toBe(false)
    expect(isRepeatClick({ pointerType: 'pen', detail: 2 })).toBe(false)
    expect(isRepeatClick({ pointerType: '', detail: 0 })).toBe(false)
  })
})

describe('moving the mouse as use', () => {
  const move = (
    movementX: number,
    movementY: number,
    pointerType = 'mouse'
  ): { pointerType: string; movementX: number; movementY: number } => ({
    pointerType,
    movementX,
    movementY
  })

  it('counts a real movement in any direction', () => {
    expect(isDeliberateMouseMove(move(3, 0))).toBe(true)
    expect(isDeliberateMouseMove(move(0, -3))).toBe(true)
    expect(isDeliberateMouseMove(move(-40, 25))).toBe(true)
  })

  it('ignores jitter and the zero-distance moves Chromium makes when the layout changes', () => {
    expect(isDeliberateMouseMove(move(0, 0))).toBe(false)
    expect(isDeliberateMouseMove(move(1, 1))).toBe(false)
    expect(isDeliberateMouseMove(move(2, 2))).toBe(false)
  })

  it('ignores a finger dragging on the touchscreen', () => {
    expect(isDeliberateMouseMove(move(40, 0, 'touch'))).toBe(false)
  })
})
