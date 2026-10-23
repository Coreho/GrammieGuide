import { describe, expect, it } from 'vitest'
import { ContactController } from '../../src/main/services/contacts/contactController'
import { ContactRequests } from '../../src/main/services/contacts/contactRequests'
import { defaultConfig } from '../../src/shared/configSchema'
import type { RequestJournal, ContactChannel } from '../../src/main/services/contacts/types'
import type { ContactConfig } from '../../src/shared/contactSettings'

function fixture(): {
  controller: ContactController
  requests: ContactRequests
  config: () => ContactConfig
  sends: () => number
  advance: (ms: number) => void
  channel: ContactChannel
} {
  let config = defaultConfig().contacts
  config = {
    ...config,
    enabled: true,
    preferred: { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
    fallback: { id: 'fallback', name: 'Tom', phone: '+15552222222' },
    credentials: {
      accountSid: `AC${'a'.repeat(32)}`,
      apiKeySid: `SK${'b'.repeat(32)}`,
      apiKeySecret: 'secret',
      sender: '+15550000000'
    }
  }
  let journal: RequestJournal = { version: 1, requests: [] }
  let time = Date.now()
  let sends = 0
  const channel: ContactChannel = {
    submit: async () => {
      sends++
      return { sid: 'outbound', sender: '+15550000000' }
    },
    delivery: async () => ({ status: 'pending' }),
    replies: async () => []
  }
  const requests = new ContactRequests(
    {
      load: async () => structuredClone(journal),
      save: async (value) => {
        journal = structuredClone(value)
      }
    },
    channel,
    () => time
  )
  return {
    controller: new ContactController(
      requests,
      () => config,
      (value) => {
        config = value
      },
      async () => undefined,
      () => time
    ),
    requests,
    config: () => config,
    sends: () => sends,
    advance: (ms) => {
      time += ms
    },
    channel
  }
}

describe('caregiver setup and Home callback controller', () => {
  it('never reads back credentials and keeps them through a contact-settings save', async () => {
    const f = fixture()
    const settings = f.controller.settings()
    expect(settings.hasCredentials).toBe(true)
    expect(JSON.stringify(settings)).not.toContain('secret')
    expect(JSON.stringify(settings)).not.toContain('accountSid')
    await f.controller.saveSettings({
      ...settings,
      preferred: { ...settings.preferred, name: 'Susan' }
    })
    expect(f.config().credentials?.apiKeySecret).toBe('secret')
    expect(f.sends()).toBe(0)
  })
  it('ignores extra provider fields in a normal settings save and validates credential writes separately', async () => {
    const f = fixture()
    await f.controller.saveSettings({
      ...f.controller.settings(),
      credentials: { apiKeySecret: 'injected' }
    })
    expect(f.config().credentials?.apiKeySecret).toBe('secret')
    await expect(f.controller.setCredentials({ apiKeySecret: 'injected' })).rejects.toThrow(
      'Check the Twilio'
    )
    await f.controller.setCredentials(null)
    expect(f.controller.settings().hasCredentials).toBe(false)
    expect((await f.controller.request()).problem).toBe('not-configured')
    expect(f.sends()).toBe(0)
  })
  it('derives numbers from saved setup, deduplicates taps and retains the names used at submission', async () => {
    const f = fixture()
    const [first, second] = await Promise.all([f.controller.request(), f.controller.request()])
    expect(first.request?.id).toBe(second.request?.id)
    expect(first.request?.attempts[0]?.name).toBe('Sarah')
    expect(JSON.stringify(first)).not.toContain('+1555')
    expect(f.sends()).toBe(1)
    await expect(
      f.controller.saveSettings({
        ...f.controller.settings(),
        preferred: { id: 'preferred', name: 'Someone else', phone: '+15559999999' }
      })
    ).rejects.toThrow('active')
    await expect(f.controller.setCredentials(null)).rejects.toThrow('active')
    expect(f.config().preferred?.name).toBe('Sarah')
    f.advance(600_000)
    await f.controller.saveSettings({
      ...f.controller.settings(),
      preferred: { id: 'preferred', name: 'Susan', phone: '+15553333333' }
    })
    expect((await f.controller.home()).contact?.name).toBe('Susan')
    expect((await f.controller.home()).request?.attempts[0]?.name).toBe('Sarah')
  })
  it('turning off the feature removes the control and cannot send', async () => {
    const f = fixture()
    await f.controller.saveSettings({ ...f.controller.settings(), enabled: false })
    expect((await f.controller.home()).contact).toBeNull()
    expect((await f.controller.request()).problem).toBe('not-configured')
    expect(f.sends()).toBe(0)
  })
})
