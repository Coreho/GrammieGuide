import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let home: Page
let admin: Page
let folder: string
type FixtureAction = {
  delivery?: 'pending' | 'delivered' | 'failed'
  advance?: number
  reply?: string
  failSubmission?: boolean
}
type E2e = {
  __e2e__: {
    createAdminWindow: () => void
    contactFixture: { update: (action: FixtureAction) => Promise<void>; count: () => number }
  }
}
const update = (action: FixtureAction): Promise<void> =>
  app.evaluate(
    async (_electron, value) => (globalThis as unknown as E2e).__e2e__.contactFixture.update(value),
    action
  )
const count = (): Promise<number> =>
  app.evaluate(() => (globalThis as unknown as E2e).__e2e__.contactFixture.count())

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'grammie-contact-test-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  home = await app.firstWindow()
  await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
  const opened = app.waitForEvent('window')
  await app.evaluate(() => (globalThis as unknown as E2e).__e2e__.createAdminWindow())
  admin = await opened
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Contacts', exact: true }).click()
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('the test stays off until a person and credentials are saved', async () => {
  const panel = admin.getByRole('region', { name: 'Test a callback text' })
  await expect(panel.getByText('Save at least one person above before testing.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send test text' })).toBeDisabled()
  await admin.evaluate(async () => {
    await window.admin.saveContactSettings({
      enabled: true,
      people: [
        { id: 'sarah', name: 'Sarah', phone: '+15551111111' },
        { id: 'tom', name: 'Tom', phone: '+15552222222' }
      ],
      expiryMinutes: 10,
      fallbackAfterMinutes: 2
    })
  })
  // Reopen the tab so it reads what was saved.
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
  await admin.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(panel.getByText('Save the SMS credentials above before testing.')).toBeVisible()
  await admin.getByText('SMS credentials', { exact: true }).click()
  await admin.getByLabel('Twilio Account SID', { exact: true }).fill(`AC${'a'.repeat(32)}`)
  await admin.getByLabel('Twilio API Key SID', { exact: true }).fill(`SK${'b'.repeat(32)}`)
  await admin.getByLabel('Twilio API key secret', { exact: true }).fill('not-a-real-key')
  await admin.getByLabel('Twilio sender number', { exact: true }).fill('+15550000000')
  await admin.getByRole('button', { name: 'Save SMS credentials', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Send test text' })).toBeEnabled()
  expect(await count()).toBe(0)
})

test('one test text shows sent, delivered and a YES reply as separate results', async ({
  browserName: _browserName
}, info) => {
  const panel = admin.getByRole('region', { name: 'Test a callback text' })
  const result = panel.getByRole('status', { name: 'Latest test' })
  await panel.getByLabel('Send the test to').selectOption({ label: 'Tom (second person)' })
  await panel.getByRole('button', { name: 'Send test text' }).click()
  await expect(result.getByText(/Test text to Tom/)).toBeVisible()
  await expect(result.locator('li').nth(0)).toHaveAttribute('data-state', 'yes')
  await expect(result.locator('li').nth(1)).toHaveAttribute('data-state', 'waiting')
  await expect(result.locator('li').nth(2)).toHaveAttribute('data-state', 'waiting')
  // Open test: no second text, and her Home shows nothing about it.
  await expect(panel.getByRole('button', { name: 'Send test text' })).toBeDisabled()
  expect((await admin.evaluate(() => window.admin.startContactTest('sarah'))).problem).toBe(
    'test-active'
  )
  expect(await count()).toBe(1)
  expect((await home.evaluate(() => window.launcher.getContact())).request).toBeNull()

  await update({ delivery: 'delivered' })
  await expect(result.locator('li').nth(1)).toHaveAttribute('data-state', 'yes')
  await expect(result.locator('li').nth(2)).toHaveAttribute('data-state', 'waiting')
  await update({ reply: 'tom' })
  await expect(result.locator('li').nth(2)).toHaveAttribute('data-state', 'yes')
  await expect(result.getByText(/Tom replied YES at/)).toBeVisible()
  await expect(result.getByText(/Checked at/)).toBeVisible()
  await admin.screenshot({ path: info.outputPath('contact-test.png'), fullPage: true })

  const log = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog()))
  expect(log).toContain('contact-test-started')
  expect(log).toContain('contact-test-answered')
  expect(log).not.toMatch(/\+1555|Tom|Sarah|not-a-real-key/)
})

test('a failed submission is reported plainly, survives a restart of the panel, and is not resent', async () => {
  const panel = admin.getByRole('region', { name: 'Test a callback text' })
  const result = panel.getByRole('status', { name: 'Latest test' })
  await update({ failSubmission: true })
  await panel.getByLabel('Send the test to').selectOption({ label: 'Sarah (first person)' })
  await panel.getByRole('button', { name: 'Send test text' }).click()
  await expect(result.getByText(/Test text to Sarah/)).toBeVisible()
  await expect(result.locator('li').nth(0)).toHaveAttribute('data-state', 'no')
  await expect(result.getByText(/it is not sent again/)).toBeVisible()
  const sent = await count()
  await update({ failSubmission: false })
  await admin.reload()
  await admin.getByPlaceholder('PIN').fill('2468')
  await admin.getByRole('button', { name: /Unlock/ }).click()
  await admin.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(result.getByText(/Test text to Sarah/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send test text' })).toBeDisabled()
  expect(await count()).toBe(sent)
  expect((await admin.evaluate(() => window.admin.startContactTest('sarah'))).problem).toBe(
    'test-active'
  )
  expect(await count()).toBe(sent)
})

test('her own request refuses a test and is left untouched', async () => {
  // Past the uncertain test's window, so only her request stands in the way.
  await update({ advance: 6 * 60_000 })
  await home.getByRole('button', { name: 'Ask Sarah to call', exact: true }).click()
  await expect
    .poll(async () => (await home.evaluate(() => window.launcher.getContact())).request?.purpose)
    .toBe('real')
  const sent = await count()
  const state = await admin.evaluate(() => window.admin.startContactTest('tom'))
  expect(state.problem).toBe('help-request-active')
  expect(await count()).toBe(sent)
})
