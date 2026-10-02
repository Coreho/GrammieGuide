import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let app: ElectronApplication
let page: Page
let admin: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-chat-setting-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const newWindow = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await newWindow
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN' }).click()
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await admin.getByLabel(/Read Buddy's replies out loud/).uncheck()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.voiceEnabled)))
    .toBe(false)
})

test.afterAll(async () => {
  await app.close()
})

test('caregiver switches chat off live while Buddy keeps reacting, and can restore chat', async () => {
  const chatEnabled = admin.getByLabel('Allow Buddy chat')
  const buddy = page.getByRole('button', { name: 'Say hello to Buddy' })
  const floor = page.locator('[data-buddy-activity]')
  const invitation = page.locator('[data-buddy-chat-invite]')
  const input = page.getByPlaceholder('Say something...')
  await page.evaluate(() => {
    document.body.dataset.testHomeAlive = 'same-document'
  })
  await expect(chatEnabled).toBeChecked()
  await buddy.click()
  await expect(invitation).toBeVisible()
  await chatEnabled.uncheck()
  await expect(invitation).toHaveCount(0)
  await expect(input).toHaveCount(0)
  await buddy.click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  await expect(page.getByRole('status')).toBeVisible()
  await expect(invitation).toHaveCount(0)
  await page.keyboard.press('Control+Shift+B')
  await expect(page.getByRole('menuitem', { name: "Let's chat" })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Wave', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  // A saved direct-chat tap must fall back to the same friendly reactions.
  await admin.getByLabel('When she taps Buddy').selectOption('chat')
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.tapAction)))
    .toBe('chat')
  await buddy.click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  await expect(floor).toHaveAttribute('data-buddy-clip', /.+/)
  await expect(input).toHaveCount(0)
  await expect(invitation).toHaveCount(0)

  await chatEnabled.check()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.chatEnabled)))
    .toBe(true)
  await buddy.click()
  await expect(input).toBeVisible()
  await expect(floor).toHaveAttribute('data-buddy-activity', /^chat\./)
  await chatEnabled.uncheck()
  await expect(input).toHaveCount(0)
  await expect(floor).not.toHaveAttribute('data-buddy-activity', /^chat\./)
  await expect(floor.locator('canvas')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-test-home-alive', 'same-document')
  await chatEnabled.check()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.chatEnabled)))
    .toBe(true)
  await expect(input).toHaveCount(0)
  await buddy.click()
  await expect(input).toBeVisible()
  await page.getByRole('button', { name: 'Close chat' }).click()
})
