import type { EmbeddedWhatsAppSession } from './whatsAppSession'
import type { ProviderCallState, WhatsAppAdapter } from './whatsAppAdapter'

/** Real account linking is the first transport slice; call capability stays unverified. */
export function createWhatsAppSessionAdapter(setup: EmbeddedWhatsAppSession): WhatsAppAdapter {
  let revision = 0
  return {
    location: 'embedded',
    read: async (signal): Promise<ProviderCallState> => {
      signal.throwIfAborted()
      return {
        revision: ++revision,
        connection: setup.state().phase === 'link-required' ? 'not-linked' : 'unavailable',
        capabilities: { voice: false, video: false, answer: false, decline: false, end: false },
        call: null
      }
    },
    execute: async () => {
      throw new Error('In-app calling controls have not been verified')
    },
    subscribe: (listener) => setup.subscribe(listener)
  }
}
