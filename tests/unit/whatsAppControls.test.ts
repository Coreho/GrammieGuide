import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WhatsAppControls } from '../../src/renderer/admin/src/components/WhatsAppControls'
import type { WhatsAppCallState } from '../../src/shared/whatsAppCalls'

const idle: WhatsAppCallState = {
  connection: 'ready',
  contacts: [{ id: 'preferred', name: 'Sarah' }],
  call: null,
  pending: null,
  availableActions: ['voice', 'video']
}
const render = (state: WhatsAppCallState, busy = false): string =>
  renderToStaticMarkup(createElement(WhatsAppControls, { state, busy, onCommand: () => {} }))

// Match the repository's static-render checks. Real controller and IPC tests exercise
// commands and side effects; these checks cover visible state and enabled controls.
describe('caregiver WhatsApp controls', () => {
  it('disables both calling buttons when the real transport is unavailable', () => {
    const html = render({ ...idle, connection: 'unavailable', availableActions: [] })
    expect(html).toContain('Live calling is not available yet')
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('Voice call Sarah')
    expect(html).toContain('Video call Sarah')
  })
  it('exposes supported controls and disables them during an operation', () => {
    expect(render(idle)).not.toContain('disabled=""')
    expect(render(idle, true).match(/disabled=""/g)).toHaveLength(2)
    const html = render({ ...idle, pending: 'start', availableActions: [] })
    expect(html).toContain('Waiting for WhatsApp to confirm')
    expect(html.match(/disabled=""/g)).toHaveLength(2)
  })
  it('shows answer and decline for incoming calls, then end for connected calls', () => {
    const state: WhatsAppCallState = {
      ...idle,
      call: { id: 'local-id', contact: idle.contacts[0]!, mode: 'voice', phase: 'incoming' },
      availableActions: ['answer', 'decline']
    }
    const incoming = render(state)
    expect(incoming).toContain('Sarah is calling')
    expect(incoming).toContain('>Answer</button>')
    expect(incoming).toContain('>Decline</button>')
    const connected = render({
      ...state,
      call: { ...state.call!, phase: 'connected' },
      availableActions: ['end']
    })
    expect(connected).toContain('Talking with Sarah')
    expect(connected).not.toContain('>Answer</button>')
    expect(connected).toContain('>End call</button>')
  })
  it('keeps an uncertain call visible instead of claiming it ended', () => {
    const html = render({
      ...idle,
      connection: 'disconnected',
      call: { id: 'local-id', contact: idle.contacts[0]!, mode: 'voice', phase: 'unknown' },
      availableActions: []
    })
    expect(html).toContain('call may still be active')
    expect(html).not.toContain('Call ended')
    expect(html).not.toContain('<button')
  })
})
