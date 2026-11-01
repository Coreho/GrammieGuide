/**
 * She uses a mouse, and the app was built thinking of taps. Pure rules, so Home and the
 * embedded page's preload can't drift apart and they can be tested without a DOM.
 */

/** Smaller movements are a nudged desk or a jittery sensor, not her reaching for the mouse. */
export const MOUSE_MOVE_MIN_PX = 3

export function isDeliberateMouseMove(event: {
  pointerType: string
  movementX: number
  movementY: number
}): boolean {
  return (
    event.pointerType === 'mouse' &&
    Math.hypot(event.movementX, event.movementY) >= MOUSE_MOVE_MIN_PX
  )
}

/**
 * The second click of a double-click, which Windows reports through `detail` using its own
 * speed and distance settings. Many people double-click everything out of long habit. The
 * first click has already changed the screen, so the second would land on whatever appeared
 * under the pointer: a tile opened a card inside it, Back went back twice, Next skipped a page.
 * Taps and keyboard activation never count, and neither does a plain repeated click once
 * Windows' double-click time has passed.
 */
export function isRepeatClick(event: { detail: number; pointerType: string }): boolean {
  return event.pointerType === 'mouse' && event.detail >= 2
}
