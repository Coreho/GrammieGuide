import { describe, expect, it } from 'vitest'
import { plainErrorMessage } from '@shared/ipcErrors'

/**
 * Main throws plain sentences meant for the caregiver; Electron wraps them on the
 * way to the renderer (TASK-41 review note). If this stops working the symptom is
 * only "the message reads a bit worse", so it is pinned here rather than left to a
 * future admin screen to discover.
 */
describe('plainErrorMessage', () => {
  it('strips the one Electron adds around a thrown handler error', () => {
    const wrapped = new Error(
      `Error invoking remote method 'library:import': Error: No files were added. Choose photo files (PNG, JPG).`
    )
    expect(plainErrorMessage(wrapped)).toBe('No files were added. Choose photo files (PNG, JPG).')
  })

  it('strips the wrapper when Electron did not add the inner "Error:"', () => {
    expect(plainErrorMessage(new Error("Error invoking remote method 'config:set': Saved."))).toBe(
      'Saved.'
    )
  })

  it('strips wrappers that stacked when a handler re-threw a wrapped error', () => {
    const wrapped = new Error(
      `Error invoking remote method 'outer': Error: Error invoking remote method 'inner': Error: Nope.`
    )
    expect(plainErrorMessage(wrapped)).toBe('Nope.')
  })

  it('leaves an unwrapped message exactly as it is', () => {
    expect(plainErrorMessage(new Error('Library index is unavailable right now'))).toBe(
      'Library index is unavailable right now'
    )
  })

  it('never returns an empty message, even when the wrapper was all there was', () => {
    // Losing the text entirely would leave the panel showing nothing at all.
    expect(plainErrorMessage(new Error("Error invoking remote method 'x': Error:"))).toBe(
      "Error invoking remote method 'x': Error:"
    )
  })

  it('copes with something thrown that is not an Error', () => {
    expect(plainErrorMessage('just a string')).toBe('just a string')
    expect(plainErrorMessage(undefined)).toBe('undefined')
  })
})
