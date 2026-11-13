import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// SMS callbacks stay hidden until the carriers approve the A2P 10DLC campaign
// (services/contacts/smsCallbacks.ts). This suite launches without the
// GRAMMIEGUIDE_SMS_CALLBACKS opt-in the other contact suites use, so it sees
// what her computer sees.
let app: ElectronApplication
let home: Page
let admin: Page
let folder: string
const errors: string[] = []

async function textsSent(): Promise<number> {
  return app.evaluate(() =>
    (
      globalThis as unknown as { __e2e__: { contactFixture: { count: () => number } } }
    ).__e2e__.contactFixture.count()
  )
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'grammie-sms-hidden-'))
  const env = { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  delete env['GRAMMIEGUIDE_SMS_CALLBACKS']
  app = await electron.launch({ args: ['.', `--user-data-dir=${folder}`], cwd: process.cwd(), env })
  home = await app.firstWindow()
  home.on('pageerror', (error) => errors.push(error.message))
  await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  admin.on('pageerror', (error) => errors.push(error.message))
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  // A setup saved as on, with credentials, as an earlier version allowed.
  await admin.evaluate(async () => {
    await window.admin.saveContactSettings({
      enabled: true,
      people: [
        { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
        { id: 'second', name: 'Tom', phone: '+15552222222' }
      ],
      expiryMinutes: 15,
      fallbackAfterMinutes: 5
    })
    await window.admin.setContactCredentials({
      accountSid: `AC${'a'.repeat(32)}`,
      apiKeySid: `SK${'b'.repeat(32)}`,
      apiKeySecret: 'test-secret-not-a-real-key',
      sender: '+15550000000'
    })
  })
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('admin keeps the people but shows no SMS controls, and saving keeps the saved choice', async () => {
  await admin.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(admin.getByLabel('Person 1 name', { exact: true })).toHaveValue('Sarah')
  await expect(admin.getByText(/text-message registration is waiting for approval/)).toBeVisible()
  await expect(admin.getByLabel('Show the callback button on Home')).toHaveCount(0)
  await expect(admin.getByText('SMS credentials', { exact: true })).toHaveCount(0)
  await expect(admin.getByText(/Test a callback text/)).toHaveCount(0)
  await expect(admin.getByText(/Callback requests/)).toHaveCount(0)

  await admin.getByLabel('Person 2 name', { exact: true }).fill('Tommy')
  await admin.getByRole('button', { name: 'Save contact settings', exact: true }).click()
  await expect(
    admin.getByRole('status').filter({ hasText: 'Contact settings saved' })
  ).toBeVisible()
  const saved = await admin.evaluate(() => window.admin.getContactSettings())
  expect(saved).toMatchObject({ enabled: true, hasCredentials: true, smsCallbacks: false })
  expect(saved.people.map((person) => person.name)).toEqual(['Sarah', 'Tommy'])
})

test('Home shows no callback button, refuses a request and Buddy never mentions it', async () => {
  await home.reload()
  await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
  await expect(home.getByRole('button', { name: /to call$/ })).toHaveCount(0)
  const contacts = await home.evaluate(async () => (await window.launcher.getConfig()).contacts)
  expect(contacts.enabled).toBe(false)
  expect(await home.evaluate(() => window.launcher.requestCallback())).toMatchObject({
    contact: null,
    problem: 'not-configured'
  })
  const chat = await home.evaluate(() =>
    window.launcher.buddyChat([{ role: 'user', text: 'I am scared' }])
  )
  expect(chat.reply).not.toContain('Ask Sarah')
  expect(await admin.evaluate(() => window.admin.startContactTest('preferred'))).toMatchObject({
    problem: 'not-configured'
  })
  expect(await textsSent()).toBe(0)
  expect(errors).toEqual([])
})
