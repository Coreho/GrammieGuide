import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M4 Buddy on Home, against the built app: the rigged cat actually loads
 * under the launcher's CSP (the GLB, its blob: texture, no WebAssembly
 * decoders), his behavior follows the chat panel, and the caregiver's new
 * Buddy settings stick. The floor exposes the behavior machine's current
 * activity as data-buddy-activity, which is what these assertions read.
 */

let app: ElectronApplication
let page: Page
const problems: string[] = []

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-e2e-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('the cat model loads with no errors and Buddy greets her', async () => {
  const floor = page.locator('[data-buddy-activity]')
  await expect(floor).toBeVisible()
  await expect(floor.locator('canvas')).toBeVisible()
  // Give the GLB and its texture time to load, then make sure nothing complained.
  await page.waitForTimeout(3000)
  expect(problems).toEqual([])
})

test('he joins the chat and says goodbye when it closes', async () => {
  const floor = page.locator('[data-buddy-activity]')
  await page.getByRole('button', { name: 'Talk to your companion' }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', /^chat\./)
  await expect(page.getByPlaceholder('Say something...')).toBeVisible()

  await page.getByRole('button', { name: 'Close chat' }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'farewell')
  await expect(page.getByRole('status')).toBeVisible()
})

test('admin: roaming and voice settings are saved', async () => {
  const newWindowPromise = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }).__e2e__.createAdminWindow()
  })
  const admin = await newWindowPromise
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN' }).click()
  await admin.getByRole('button', { name: 'Buddy' }).click()

  const roaming = admin.getByLabel(/strolls along the bottom/)
  const readAloud = admin.getByLabel(/Read Buddy's replies out loud/)
  await expect(roaming).toBeChecked()
  await expect(readAloud).toBeChecked()
  await roaming.uncheck()
  await readAloud.uncheck()
  await admin.locator('select', { has: admin.locator('option[value="en-US-GuyNeural"]') }).selectOption('en-US-GuyNeural')

  const buddy = await page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy))
  expect(buddy).toMatchObject({ roaming: false, voiceEnabled: false, ttsVoice: 'en-US-GuyNeural' })
  await admin.close()
})
