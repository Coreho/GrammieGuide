import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let admin: Page
const reviewDir = '.impeccable/review/orientation'
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  mkdirSync(reviewDir, { recursive: true })
  app = await electron.launch({
    args: [
      '.',
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-orientation-e2e-'))}`
    ],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('HomeHeader and admin HomePreview display the time-of-day orientation badge', async () => {
  const badge = page.locator('header [data-day-period]')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-day-period', /^(morning|afternoon|evening|night)$/)
  await expect(badge).toHaveText(/^(Morning|Afternoon|Evening|Night)$/)

  const previewBadge = admin.locator('[data-home-preview] header [data-day-period]')
  await expect(previewBadge).toBeVisible()
  await expect(previewBadge).toHaveText(/^(Morning|Afternoon|Evening|Night)$/)
  await page.screenshot({ path: join(reviewDir, 'home-orientation.png') })
})

test('rapid-tap confusion closes open built-in views, shows live orientation, and offers calming actions', async () => {
  // Add a built-in Weather tile and lower rapid-tap threshold to 3 taps
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('weather')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({
      confusion: {
        ...config.confusion,
        rapidTap: { count: 3, windowMs: 5000, clusterRadiusPx: 300, cooldownMs: 1000 }
      }
    })
  })

  // Open the built-in Weather overlay
  await page.getByRole('button', { name: 'Weather', exact: true }).click()
  const weatherMsg = page.getByText('No weather location configured yet.')
  await expect(weatherMsg).toBeVisible()

  // Trigger rapid taps on the Weather overlay card (tile click + 2 overlay clicks = 3 taps)
  await weatherMsg.click()
  await weatherMsg.click()

  // ConfusionOverlay appears AND the underlying Weather built-in overlay was closed
  const confusionDialog = page.getByRole('dialog', { name: "Let's take a breath" })
  await expect(confusionDialog).toBeVisible()
  await expect(weatherMsg).toHaveCount(0)

  // Verify live orientation banner and calming action buttons
  const orientationBanner = confusionDialog.locator('[data-confusion-orientation]')
  await expect(orientationBanner).toBeVisible()
  await expect(orientationBanner).toContainText(/It is .* (morning|afternoon|evening|night), /)

  await expect(confusionDialog.getByRole('button', { name: 'Back to Home' })).toBeVisible()
  await expect(confusionDialog.getByRole('button', { name: 'Play Calming Music' })).toBeVisible()
  await expect(confusionDialog.getByRole('button', { name: 'Look at Family Photos' })).toBeVisible()
  await expect(confusionDialog.getByRole('button', { name: 'Chat with Buddy' })).toBeVisible()
  await page.screenshot({ path: join(reviewDir, 'confusion-overlay.png') })

  // Tapping "Look at Family Photos" closes ConfusionOverlay and opens her Photos viewer
  await confusionDialog.getByRole('button', { name: 'Look at Family Photos' }).click()
  await expect(confusionDialog).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Pictures' })).toBeVisible()

  // Close Photos viewer back to Home
  await page.getByRole('button', { name: /Back to Home/ }).click()
  await expect(page.getByRole('dialog', { name: 'Pictures' })).toHaveCount(0)
})
