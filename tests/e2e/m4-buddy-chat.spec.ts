import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M4 real-chat smoke test against the built app. Never needs a working
 * Anthropic key: it checks the no-key path, that the key stays write-only
 * and survives other Buddy settings being saved, and that a bad key still
 * yields a calm in-character line rather than error text.
 */

let app: ElectronApplication
let launcherPage: Page

const NO_KEY_REPLY = /my talking isn't switched on yet/i
const UNAVAILABLE_REPLY = /having a little trouble hearing you/i

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-e2e-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  launcherPage = await app.firstWindow()
  await launcherPage.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

async function sayToBuddy(text: string): Promise<void> {
  await launcherPage.getByRole('button', { name: 'Talk to your companion' }).click()
  await launcherPage.getByPlaceholder('Say something...').fill(text)
  await launcherPage.getByRole('button', { name: 'Send' }).click()
}

test('with no API key, Buddy replies with the friendly not-set-up line', async () => {
  await sayToBuddy('Hello Buddy')
  await expect(launcherPage.getByText(NO_KEY_REPLY)).toBeVisible({ timeout: 10_000 })
  await launcherPage.getByRole('button', { name: 'Close chat' }).click()
})

test('admin: API key is write-only and survives saving other Buddy settings', async () => {
  const newWindowPromise = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }).__e2e__.createAdminWindow()
  })
  const admin = await newWindowPromise
  await admin.waitForLoadState('domcontentloaded')

  await admin.getByPlaceholder('4-8 digit PIN').fill('1357')
  await admin.getByPlaceholder('Confirm PIN').fill('1357')
  await admin.getByRole('button', { name: 'Set PIN' }).click()

  await admin.getByRole('button', { name: 'Buddy' }).click()
  await expect(admin.getByText('No key set')).toBeVisible({ timeout: 10_000 })

  await admin.getByPlaceholder('sk-ant-...').fill('sk-ant-e2e-invalid-key')
  await admin.getByRole('button', { name: 'Save key' }).click()
  await expect(admin.getByText('A key is set.')).toBeVisible({ timeout: 5_000 })

  // Saving an unrelated Buddy setting must not wipe the key (mergeAdminPatch).
  await admin.locator('select').first().selectOption('claude-sonnet-5')
  await admin.getByRole('button', { name: 'Weather' }).click()
  await admin.getByRole('button', { name: 'Buddy' }).click()
  await expect(admin.getByText('A key is set.')).toBeVisible({ timeout: 5_000 })

  // The launcher's config never contains the key.
  const launcherConfig = await launcherPage.evaluate(() =>
    (window as unknown as { launcher: { getConfig: () => Promise<unknown> } }).launcher.getConfig()
  )
  expect(JSON.stringify(launcherConfig)).not.toContain('sk-ant-e2e-invalid-key')
})

test('a rejected key still gives her a calm reply, not an error', async () => {
  await sayToBuddy('How are you today?')
  await expect(launcherPage.getByText(UNAVAILABLE_REPLY)).toBeVisible({ timeout: 45_000 })
  await expect(launcherPage.getByText(/401|error|invalid/i)).toHaveCount(0)
})
