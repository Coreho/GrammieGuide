import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FONT_STEPS } from '../../src/shared/theme'

let app: ElectronApplication
let page: Page
let admin: Page
const root = mkdtempSync(join(tmpdir(), 'grammieguide-card-reference-'))
const review = '.impeccable/review/card-reference'
test.describe.configure({ mode: 'serial' })

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
}

test.beforeAll(async () => {
  mkdirSync(review, { recursive: true })
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})
test.afterAll(async () => {
  await app?.close()
})

test('caregiver saves Games and Websites artwork without changing the web destination', async () => {
  for (const [label, artwork, url] of [
    ['Games', 'games', 'https://example.com/'],
    ['Websites', 'websites', 'https://example.org/']
  ]) {
    await admin.getByLabel('Tile label', { exact: true }).fill(label!)
    await admin.getByLabel('Website address', { exact: true }).fill(url!)
    await admin.getByLabel('Card artwork', { exact: true }).selectOption(artwork!)
    await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
    await expect(
      page.getByRole('button', { name: label!, exact: true }).locator('img')
    ).toHaveAttribute('data-builtin-artwork', artwork!)
  }
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({ display: { ...cfg.display, theme: 'clayCards' } })
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.launcher
          .getConfig()
          .then((c) =>
            c.tiles.map((t) => ({ label: t.label, url: t.url, artwork: t.artwork, icon: t.icon }))
          )
      )
    )
    .toEqual([
      { label: 'Games', url: 'https://example.com/', artwork: 'games', icon: undefined },
      { label: 'Websites', url: 'https://example.org/', artwork: 'websites', icon: undefined }
    ])
  await app.close()
  await launch()
  await expect(page.locator('[data-builtin-artwork]')).toHaveCount(2)
  await expect
    .poll(() =>
      page
        .locator('[data-builtin-artwork]')
        .evaluateAll((images) =>
          images.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true)
  await admin.getByPlaceholder('Enter PIN').fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
  await expect(page.getByText('Good morning!', { exact: true })).toHaveCount(0, { timeout: 25_000 })
  await page.screenshot({ path: `${review}/home-cream.png` })
  await page
    .getByRole('button', { name: 'Games', exact: true })
    .screenshot({ path: `${review}/games.png` })
  await page
    .getByRole('button', { name: 'Websites', exact: true })
    .screenshot({ path: `${review}/websites.png` })
})

test('matching artwork respects fixed layouts, font steps, overrides and theme switches', async () => {
  for (const homeLayout of ['simple4', 'more8'] as const) {
    for (let fontStep = 0; fontStep < FONT_STEPS.length; fontStep++) {
      await admin.evaluate(
        async ({ homeLayout, fontStep }) => {
          const c = await window.admin.getConfig()
          await window.admin.setConfig({
            display: { ...c.display, homeLayout, fontStep },
            tiles: c.tiles.map((t, index) => ({
              ...t,
              size: homeLayout === 'more8' ? 'wide' : 'normal',
              slot: homeLayout === 'more8' ? index * 2 : index
            }))
          })
        },
        { homeLayout, fontStep }
      )
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim()
          )
        )
        .toBe(String(FONT_STEPS[fontStep]))
      await expect
        .poll(() =>
          page
            .locator('.home-card')
            .evaluateAll(
              (cards) =>
                cards.filter(
                  (c) => c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1
                ).length
            )
        )
        .toBe(0)
      await expect(page.locator('[data-builtin-artwork]')).toHaveCount(2)
    }
    await page.screenshot({ path: `${review}/${homeLayout}-largest.png` })
  }
  await admin.evaluate(async () => {
    const c = await window.admin.getConfig()
    await window.admin.setConfig({
      display: { ...c.display, theme: 'tilesBold', fontStep: 0, homeLayout: 'simple4' },
      tiles: c.tiles.map((t, index) => ({
        ...t,
        size: 'normal',
        slot: index,
        icon: index === 0 ? '🌷' : undefined
      }))
    })
  })
  await expect(page.getByRole('button', { name: 'Games', exact: true })).toContainText('🌷')
  await expect(page.getByRole('button', { name: 'Games', exact: true }).locator('img')).toHaveCount(
    0
  )
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: 'Websites', exact: true })
        .locator('div')
        .last()
        .evaluate((el) => getComputedStyle(el).fontSize)
    )
    .toBe('42px')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const websites = page.getByRole('button', { name: 'Websites', exact: true })
  await websites.focus()
  await expect(websites).toHaveCSS('outline-width', '4px')
  await expect(websites).toHaveCSS('transition-duration', '0s')
})
