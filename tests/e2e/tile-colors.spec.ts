import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let admin: Page

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-colors-'))}`],
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

function swatch(color: number): Locator {
  return admin.getByRole('button', { name: `Palette color ${color}`, exact: true })
}

function homeTile(label: string): Locator {
  return page.getByRole('button', { name: label, exact: true })
}

/** What main actually saved, read through Home: the picker's own state proves nothing. */
async function savedColors(): Promise<Record<string, number>> {
  return page.evaluate(() =>
    window.launcher
      .getConfig()
      .then((c) => Object.fromEntries(c.tiles.map((t) => [t.label, t.colorIndex])))
  )
}

test('caregiver picks a swatch for a new tile and Home paints it that color', async () => {
  await expect(swatch(1)).toHaveAttribute('aria-pressed', 'true')
  await admin.getByLabel('Tile label').fill('Family')
  await admin.getByLabel('Website address').fill('https://example.com')
  await swatch(3).click()
  await expect(swatch(3)).toHaveAttribute('aria-pressed', 'true')
  await expect(swatch(1)).toHaveAttribute('aria-pressed', 'false')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  await expect.poll(savedColors).toEqual({ Family: 2 })
  await expect(homeTile('Family')).toHaveAttribute('style', /--tile3\b/)
  await expect(homeTile('Family')).toHaveAttribute('style', /--tInk3\b/)
})

test('a tile added without choosing gets a color Home is not using yet', async () => {
  // The form has reset, so the pressed swatch is the suggestion, not the last pick.
  await expect(swatch(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(swatch(3)).toHaveAttribute('aria-pressed', 'false')
  await admin.getByLabel('Tile label').fill('Recipes')
  await admin.getByLabel('Website address').fill('https://example.org')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  await expect.poll(savedColors).toEqual({ Family: 2, Recipes: 0 })
})

test('reopening a tile shows its saved color; changing it leaves the other tile alone', async () => {
  await admin.getByRole('button', { name: 'Edit Family', exact: true }).click()
  await expect(swatch(3)).toHaveAttribute('aria-pressed', 'true')
  await swatch(4).click()
  await admin.getByRole('button', { name: 'Save tile', exact: true }).click()

  await expect.poll(savedColors).toEqual({ Family: 3, Recipes: 0 })
  await expect(homeTile('Family')).toHaveAttribute('style', /--tile4\b/)
  await expect(homeTile('Recipes')).toHaveAttribute('style', /--tile1\b/)

  await admin.getByRole('button', { name: 'Edit Family', exact: true }).click()
  await expect(swatch(4)).toHaveAttribute('aria-pressed', 'true')
  await expect(swatch(3)).toHaveAttribute('aria-pressed', 'false')
  await admin.getByRole('button', { name: 'Cancel edit', exact: true }).click()
})
