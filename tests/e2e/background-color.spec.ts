import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Tile } from '../../src/shared/configSchema'
import { THEMES } from '../../src/shared/theme'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
test.describe.configure({ mode: 'serial' })

const homeToken = (name: string): Promise<string> =>
  page.evaluate(
    (name) =>
      document.querySelector<HTMLElement>('[data-home-theme]')!.style.getPropertyValue(`--${name}`),
    name
  )
const previewToken = (name: string): Promise<string> =>
  admin
    .locator('[data-home-preview-stage]')
    .evaluate((el: HTMLElement, name) => el.style.getPropertyValue(`--${name}`), name)
const choice = (name: string): ReturnType<Page['getByRole']> =>
  admin.getByRole('radio', { name, exact: true })
const savedBackground = (): Promise<string | undefined> =>
  admin.evaluate(async () => (await window.admin.getConfig()).display.background)

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-background-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
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
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.evaluate(async () => {
    const tile: Tile = {
      id: 'photos',
      type: 'builtin',
      builtinKey: 'photos',
      label: 'Photos',
      size: 'normal',
      slot: 0,
      colorIndex: 0
    }
    await window.admin.setConfig({ tiles: [tile] })
  })
  await admin.getByRole('button', { name: 'Display', exact: true }).click()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test("Home keeps its theme's own background until the caregiver picks one", async () => {
  await expect.poll(() => homeToken('bgB')).toBe(THEMES.tilesBold.bgB)
  await expect(choice('Theme default')).toBeChecked()
  // A dark theme offers only the dark presets, which keep its light text readable.
  for (const name of ['Midnight blue', 'Forest green', 'Plum', 'Charcoal', 'Deep teal']) {
    await expect(choice(name)).toBeVisible()
  }
  await expect(choice('Cream')).toHaveCount(0)
})

test('picking a background changes Home, her full-screen views and the preview, live', async () => {
  await choice('Plum').check()
  await expect.poll(() => homeToken('bgB')).toBe('#2E2034')
  expect(await homeToken('page')).toBe('#170F1B')
  await expect.poll(() => previewToken('bgB')).toBe('#2E2034')
  expect(await savedBackground()).toBe('plum')
  await page.screenshot({ path: test.info().outputPath('home-plum.png') })
  await admin
    .getByRole('group', { name: 'Background' })
    .screenshot({ path: test.info().outputPath('admin-background-choices.png') })

  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(page.locator('.photo-viewer')).toHaveCSS('background-color', 'rgb(46, 32, 52)')
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(page.locator('.photo-viewer')).toHaveCount(0)
})

test('a theme of the other tone shows its own background, and the choice comes back', async () => {
  await admin.getByLabel('Theme:').selectOption({ label: 'Butter' })
  await expect.poll(() => homeToken('bgB')).toBe(THEMES.butter.bgB)
  await expect(
    admin.getByRole('status').filter({ hasText: "The saved Plum background doesn't suit" })
  ).toBeVisible()
  await expect(choice('Theme default')).toBeChecked()
  await expect(choice('Cream')).toBeVisible()
  await expect(choice('Plum')).toHaveCount(0)
  // Still saved, so a dark theme brings it straight back.
  expect(await savedBackground()).toBe('plum')

  await admin.getByLabel('Theme:').selectOption({ label: 'Tiles Bold' })
  await expect.poll(() => homeToken('bgB')).toBe('#2E2034')
  await expect(choice('Plum')).toBeChecked()
})

test('Theme default puts the theme background back', async () => {
  await choice('Theme default').check()
  await expect.poll(() => homeToken('bgB')).toBe(THEMES.tilesBold.bgB)
  await expect.poll(() => previewToken('bgB')).toBe(THEMES.tilesBold.bgB)
  expect(await savedBackground()).toBeUndefined()
})
