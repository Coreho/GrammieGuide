import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication, admin: Page
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammie-chatgpt-e2e-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1', GRAMMIEGUIDE_E2E_CHATGPT: '1' }
  })
  await app.firstWindow()
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
})
test.afterAll(async () => {
  await app?.close()
})
async function fixture(action: 'complete' | 'fail' | 'recover'): Promise<void> {
  await app.evaluate(async (_electron, action) => {
    await (
      globalThis as unknown as { __e2e__: { chatGptFixture: (action: string) => Promise<void> } }
    ).__e2e__.chatGptFixture(action)
  }, action)
}

test('caregiver connects, sees plan confirmation, tests a completed reply, and explicitly selects ChatGPT', async () => {
  const connection = admin.getByRole('region', { name: 'ChatGPT connection' })
  await expect(
    connection.getByRole('button', { name: 'Continue with ChatGPT', exact: true })
  ).toBeEnabled()
  await connection.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click()
  await expect(
    connection.getByRole('button', { name: 'Cancel sign-in', exact: true })
  ).toBeVisible()
  await connection.getByRole('button', { name: 'Cancel sign-in', exact: true }).click()
  await expect(connection.getByRole('button', { name: 'Cancel sign-in', exact: true })).toHaveCount(
    0
  )
  await connection.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click()
  await fixture('complete')
  await expect(
    connection.getByRole('heading', { name: "You're using your ChatGPT plan" })
  ).toBeVisible()
  await connection.getByRole('button', { name: 'Got it', exact: true }).click()
  await connection.getByRole('button', { name: 'Load ChatGPT models', exact: true }).click()
  await expect(
    connection.getByRole('button', { name: 'Use this model for Buddy', exact: true })
  ).toBeDisabled()
  expect((await admin.evaluate(() => window.admin.getConfig())).buddy.model).toBe('')
  await expect(admin.getByRole('combobox', { name: 'Who answers Buddy' })).toHaveCount(0)
  await fixture('fail')
  await connection.getByRole('button', { name: 'Test ChatGPT reply', exact: true }).click()
  await expect(connection.getByRole('status')).toContainText('usage limit reached')
  await expect(
    connection.getByRole('button', { name: 'Use this model for Buddy', exact: true })
  ).toBeDisabled()
  await fixture('recover')
  await connection.getByRole('button', { name: 'Test ChatGPT reply', exact: true }).click()
  await expect(connection.getByRole('status')).toContainText('Completed reply verified')
  await connection.getByRole('button', { name: 'Use this model for Buddy', exact: true }).click()
  expect((await admin.evaluate(() => window.admin.getConfig())).buddy.model).toBe('fixture-model')
  await expect(connection.getByText('Using ChatGPT plan', { exact: true })).toBeVisible()
  const home = (await app.windows()).find((page) => page !== admin)!
  const result = await home.evaluate(() =>
    window.launcher.buddyChat([{ role: 'user', text: 'Hello Buddy' }])
  )
  expect(result).toMatchObject({ ok: true, reply: 'Hello from Buddy.' })
  const state = await admin.evaluate(() => window.admin.chatGptState())
  expect(JSON.stringify(state)).not.toMatch(/fixture-access|fixture-refresh|fixture-id/)
  await connection.screenshot({ path: 'test-results/chatgpt-connected.png' })
})

test('sign-out clears the renewable session and no other provider or API-key controls remain', async () => {
  const connection = admin.getByRole('region', { name: 'ChatGPT connection' })
  await connection.getByRole('button', { name: 'Sign out of ChatGPT', exact: true }).click()
  await expect(connection.getByRole('status')).toContainText('authorization revoked')
  await expect(
    connection.getByRole('button', { name: 'Use this model for Buddy', exact: true })
  ).toHaveCount(0)
  await expect(admin.getByRole('button', { name: 'Save key' })).toHaveCount(0)
  const home = (await app.windows()).find((page) => page !== admin)!
  expect(
    await home.evaluate(() => window.launcher.buddyChat([{ role: 'user', text: 'Hello' }]))
  ).toMatchObject({ ok: false, reason: 'not-connected' })
  await connection.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click()
  await fixture('complete')
  await expect(connection.getByRole('status')).toContainText('Signed in')
  await expect(
    connection.getByRole('heading', { name: "You're using your ChatGPT plan" })
  ).toHaveCount(0)
})
