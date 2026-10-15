import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let admin: Page

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-home-preview-'))}`],
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

test('admin window shows a scaled preview that renders saved tiles and updates live', async () => {
  const preview = admin.locator('[data-home-preview]')
  await expect(preview).toBeVisible()

  // Fresh profile has no tiles configured yet
  await expect(preview.getByText(/No tiles configured yet/)).toBeVisible()

  // Add a tile in admin
  await admin.getByLabel('Tile label').fill('News Daily')
  await admin.getByLabel('Website address').fill('https://news.example.com')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  // Preview immediately renders the saved tile
  const previewCards = preview.locator('.home-card')
  await expect(previewCards).toHaveCount(1)
  await expect(previewCards.first()).toContainText('News Daily')

  // Home screen also has the tile
  await expect(page.locator('.home-card')).toHaveCount(1)
  await expect(page.locator('.home-card').first()).toContainText('News Daily')

  // Add a second tile
  await admin.getByLabel('Tile label').fill('Family Pictures')
  await admin.getByLabel('Website address').fill('https://photos.example.com')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  await expect(previewCards).toHaveCount(2)
  await expect(previewCards.nth(1)).toContainText('Family Pictures')
})

test('preview is non-interactive: clicking a previewed tile triggers no action on Home', async () => {
  const previewStage = admin.locator('[data-home-preview-stage]')
  await expect(previewStage).toHaveAttribute('inert', '')
  await expect(previewStage).toHaveAttribute('aria-hidden', 'true')
  await expect(previewStage).toHaveCSS('pointer-events', 'none')

  // Clicking the previewed tile in admin must not open anything on Home
  const firstPreviewTile = admin.locator('[data-home-preview] .home-card').first()
  await firstPreviewTile.click({ force: true })

  // Home should not have triggered tile activation (no toast "Opening...", no navigation)
  await expect(page.getByText(/Opening/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'News Daily' })).toBeVisible()
  await expect(page.locator('nav')).toHaveCount(0)
})

test('preview updates font-scale with Display tab text size without leaking to admin root', async () => {
  // Navigate to Display tab
  await admin.getByRole('button', { name: 'Display', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Display' })).toBeVisible()

  // Preview is also rendered in Display tab and shows the saved tiles
  const displayPreview = admin.locator('[data-home-preview]')
  await expect(displayPreview).toBeVisible()
  await expect(displayPreview.locator('.home-card')).toHaveCount(2)

  const previewStage = admin.locator('[data-home-preview-stage]')
  // Initial fontStep is 0 -> font-scale 1
  await expect
    .poll(() => previewStage.evaluate((el) => el.style.getPropertyValue('--font-scale')))
    .toBe('1')

  // Adjust text size slider to step 3 (1.45x)
  const slider = admin.getByLabel(/Text size:/)
  await slider.focus()
  await admin.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('1')
  await admin.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('2')
  await admin.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('3')

  // Preview container updates its --font-scale variable
  await expect
    .poll(() => previewStage.evaluate((el) => el.style.getPropertyValue('--font-scale')))
    .toBe('1.45')

  // Home also updates its --font-scale
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--font-scale').trim()
      )
    )
    .toBe('1.45')

  // Admin's own document root remains completely unaffected
  const adminDocScale = await admin.evaluate(() =>
    document.documentElement.style.getPropertyValue('--font-scale')
  )
  expect(adminDocScale).toBe('')
})
