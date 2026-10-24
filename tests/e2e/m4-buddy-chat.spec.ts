import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let app: ElectronApplication
let launcherPage: Page

const NO_KEY_REPLY = /my talking isn't switched on yet/i

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
  await expect(launcherPage.getByRole('button', { name: 'Say hello to Buddy' })).toBeVisible()
  await launcherPage.keyboard.press('Control+Shift+B')
  await launcherPage.getByRole('menuitem', { name: "Let's chat" }).click()
  await launcherPage.getByPlaceholder('Say something...').fill(text)
  await launcherPage.getByRole('button', { name: 'Send' }).click()
}

test('without a verified ChatGPT connection, Buddy replies with the friendly not-set-up line', async () => {
  await sayToBuddy('Hello Buddy')
  await expect(launcherPage.getByText(NO_KEY_REPLY)).toBeVisible({ timeout: 10_000 })
  await launcherPage.getByRole('button', { name: 'Close chat' }).click()
})

test('Buddy settings expose only ChatGPT setup and no API-key or provider switcher', async () => {
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  const admin = await opened
  await admin.getByPlaceholder('4-8 digit PIN').fill('1357')
  await admin.getByPlaceholder('Confirm PIN').fill('1357')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await expect(
    admin.getByRole('button', { name: 'Continue with ChatGPT', exact: true })
  ).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Save key', exact: true })).toHaveCount(0)
  await expect(admin.getByRole('combobox', { name: 'Who answers Buddy' })).toHaveCount(0)
  await expect(admin.getByText(/Anthropic|OpenRouter|API key/i)).toHaveCount(0)
})
