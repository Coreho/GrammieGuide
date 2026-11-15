import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'
import { publicContacts } from '../../src/shared/contactSettings'
import {
  SMS_CALLBACKS_RELEASED,
  smsCallbacksAvailable
} from '../../src/main/services/contacts/smsCallbacks'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  list: vi.fn(),
  request: vi.fn(),
  config: vi.fn(),
  save: vi.fn(),
  admin: { webContents: { mainFrame: {} } },
  home: { webContents: { mainFrame: {} } }
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/contacts/contactRuntime', () => ({
  getContactRequests: () => ({ list: mocks.list, request: mocks.request }),
  contactNow: () => Date.now()
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.config, setConfig: mocks.save }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
import { registerContactIpc } from '../../src/main/ipc/contactIpc'

function savedSetup(): ReturnType<typeof defaultConfig> {
  const config = defaultConfig()
  config.contacts.enabled = true
  config.contacts.people = [
    { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
    { id: 'second', name: 'Tom', phone: '+15553333333' }
  ]
  config.contacts.credentials = {
    accountSid: `AC${'a'.repeat(32)}`,
    apiKeySid: `SK${'b'.repeat(32)}`,
    apiKeySecret: 'provider-secret',
    sender: '+15552222222'
  }
  return config
}

describe('the SMS callback release switch', () => {
  it('stays off until the carrier registration is approved', () => {
    expect(SMS_CALLBACKS_RELEASED).toBe(false)
    expect(smsCallbacksAvailable({})).toBe(false)
  })
  it('lets only the e2e suites opt back in', () => {
    expect(smsCallbacksAvailable({ GRAMMIEGUIDE_E2E: '1', GRAMMIEGUIDE_SMS_CALLBACKS: '1' })).toBe(
      true
    )
    expect(smsCallbacksAvailable({ GRAMMIEGUIDE_SMS_CALLBACKS: '1' })).toBe(false)
    expect(smsCallbacksAvailable({ GRAMMIEGUIDE_E2E: '1' })).toBe(false)
  })
  it('makes renderers see the feature as off without changing what was saved', () => {
    const contacts = savedSetup().contacts
    expect(publicContacts(contacts, false).enabled).toBe(false)
    expect(publicContacts(contacts, true).enabled).toBe(true)
    // People still reach Home for Family calls.
    expect(publicContacts(contacts, false).people.map((p) => p.name)).toEqual(['Sarah', 'Tom'])
    expect(contacts.enabled).toBe(true)
  })
})

describe('contact IPC while SMS callbacks are hidden', () => {
  const homeEvent = {
    sender: mocks.home.webContents,
    senderFrame: mocks.home.webContents.mainFrame
  }
  const adminEvent = {
    sender: mocks.admin.webContents,
    senderFrame: mocks.admin.webContents.mainFrame
  }
  const handler = (
    channel: string
  ): ((...args: unknown[]) => Promise<Record<string, unknown>> | Record<string, unknown>) =>
    mocks.handle.mock.calls.find(([name]) => name === channel)![1]

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.config.mockReturnValue(savedSetup())
    mocks.list.mockResolvedValue([])
    mocks.request.mockResolvedValue({})
    registerContactIpc()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('gives Home no contact and refuses her request without sending', async () => {
    expect(await handler('contacts:home')(homeEvent)).toEqual({ contact: null, request: null })
    expect(await handler('contacts:request')(homeEvent)).toEqual({
      contact: null,
      request: null,
      problem: 'not-configured'
    })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('refuses a caregiver test text without sending', async () => {
    const result = await handler('contacts:startTest')(adminEvent, { contactId: 'preferred' })
    expect(result.problem).toBe('not-configured')
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('tells admin the switch is off but keeps the saved choice', async () => {
    expect(handler('contacts:getSettings')(adminEvent)).toMatchObject({
      enabled: true,
      hasCredentials: true,
      smsCallbacks: false
    })
  })

  it('works as before once the switch is on', async () => {
    vi.stubEnv('GRAMMIEGUIDE_E2E', '1')
    vi.stubEnv('GRAMMIEGUIDE_SMS_CALLBACKS', '1')
    expect(handler('contacts:getSettings')(adminEvent)).toMatchObject({ smsCallbacks: true })
    expect((await handler('contacts:home')(homeEvent)).contact).toMatchObject({ name: 'Sarah' })
    await handler('contacts:request')(homeEvent)
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
})
