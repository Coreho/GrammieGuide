import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M2 smoke test: launches the real built app (not mocks) and drives it
 * through the flows the plan's M2 verification section calls for -
 * launcher boots, admin PIN setup/gate actually enforces, tile CRUD
 * persists, reliability debug buttons still work. Brought forward from M5
 * because M2 has real interactive UI (PIN entry, forms) that can't be
 * meaningfully checked by reading code alone.
 */

let app: ElectronApplication
let launcherPage: Page

test.beforeAll(async () => {
  // A fresh userData dir per run - electron-store persists to the real
  // profile otherwise, so a second run would find yesterday's test PIN
  // already set and this suite would no longer be idempotent.
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

test('launcher boots and shows the empty-tiles message', async () => {
  await expect(launcherPage.getByText(/No tiles configured yet/i)).toBeVisible({ timeout: 10_000 })
  await expect(launcherPage.getByRole('button', { name: 'Get help' })).toBeVisible()
})

test('on-screen font scale control changes --font-scale live', async () => {
  const before = await launcherPage.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-scale')
  )
  await launcherPage.getByRole('button', { name: 'Make text bigger' }).click()
  await launcherPage.waitForTimeout(300)
  const after = await launcherPage.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-scale')
  )
  expect(after.trim()).not.toBe(before.trim())
})

test('admin window: PIN setup gates the panel, then tile CRUD persists', async () => {
  const newWindowPromise = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }).__e2e__.createAdminWindow()
  })
  const adminWindow = await newWindowPromise
  await adminWindow.waitForLoadState('domcontentloaded')

  await expect(adminWindow.getByRole('heading', { name: /set up a caregiver pin/i })).toBeVisible({
    timeout: 10_000
  })

  await adminWindow.getByPlaceholder('4-8 digit PIN').fill('1357')
  await adminWindow.getByPlaceholder('Confirm PIN').fill('1357')
  await adminWindow.getByRole('button', { name: 'Set PIN' }).click()

  await expect(adminWindow.getByRole('heading', { name: 'GrammieGuide' })).toBeVisible({ timeout: 10_000 })

  await adminWindow.getByPlaceholder('Label (e.g. Weather Channel)').fill('Test Site')
  await adminWindow.getByPlaceholder('https://...').fill('https://example.com')
  await adminWindow.getByRole('button', { name: 'Add Tile' }).click()

  await expect(adminWindow.getByText('Test Site')).toBeVisible({ timeout: 5_000 })

  await adminWindow.getByRole('button', { name: 'Reliability' }).click()
  await adminWindow.getByRole('button', { name: 'Test Wi-Fi adapter discovery' }).click()
  await expect(adminWindow.locator('li').filter({ hasText: 'wifi-adapter-discovery' })).toBeVisible({
    timeout: 15_000
  })
})

test('the tile just added opens the embedded browser with NavBar Home/Back', async () => {
  // M2 has no live cross-window config sync yet - the launcher only reads
  // config on mount, so it needs a reload to pick up the tile the admin
  // window just persisted.
  await launcherPage.reload()
  await launcherPage.getByRole('button', { name: /Test Site/ }).click()

  await expect(launcherPage.getByRole('button', { name: '🏠 Home' })).toBeVisible({ timeout: 10_000 })
  await expect(launcherPage.getByRole('button', { name: '← Back' })).toBeVisible()

  await launcherPage.getByRole('button', { name: '🏠 Home' }).click()
  await expect(launcherPage.getByRole('button', { name: /Test Site/ })).toBeVisible({ timeout: 5_000 })
})
