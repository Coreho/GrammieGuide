import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Tile } from '../../src/shared/configSchema'
import { FONT_STEPS, THEME_NAMES, type ThemeName } from '../../src/shared/theme'
import type { HomeLayoutName } from '../../src/shared/homeLayout'

let app: ElectronApplication
let page: Page
let admin: Page
const errors: string[] = []
const keys = ['photos', 'music', 'weather', 'news'] as const
const labels = ['Photos', 'Music', 'Weather', 'News']
const review = '.impeccable/review/home-cards'
test.describe.configure({ mode: 'serial' })

function cards(wide = false): Tile[] {
  return keys.map((builtinKey, index) => ({
    id: builtinKey,
    builtinKey,
    label: labels[index]!,
    type: 'builtin',
    colorIndex: index,
    size: wide ? 'wide' : 'normal',
    slot: wide ? index * 2 : index
  }))
}

async function configure(
  tiles = cards(),
  homeLayout: HomeLayoutName = 'simple4',
  fontStep = 0,
  theme: ThemeName = 'tilesBold'
): Promise<void> {
  await admin.evaluate(
    async (settings) => {
      const config = await window.admin.getConfig()
      await window.admin.setConfig({
        tiles: settings.tiles,
        display: { ...config.display, ...settings.display }
      })
    },
    { tiles, display: { homeLayout, fontStep, theme } }
  )
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim()
      )
    )
    .toBe(String(FONT_STEPS[fontStep]))
  await expect(page.locator('.home-card')).toHaveCount(tiles.length)
}

test.beforeAll(async () => {
  mkdirSync(review, { recursive: true })
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-card-art-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
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
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('offline built-in artwork has live labels, visible focus and the original action', async () => {
  await configure()
  for (const key of keys) {
    const tile = page.locator(`[data-tile-slot="${keys.indexOf(key)}"]`)
    await expect(tile).toHaveAccessibleName(labels[keys.indexOf(key)]!)
    await expect(tile.locator('[data-builtin-artwork]')).toHaveAttribute(
      'data-builtin-artwork',
      key
    )
    await expect
      .poll(() =>
        tile
          .locator('img')
          .evaluate(
            (img: HTMLImageElement) =>
              img.complete && img.naturalWidth > 0 && !img.src.startsWith('https:')
          )
      )
      .toBe(true)
    await expect(tile.locator('div').last()).toHaveText(labels[keys.indexOf(key)]!)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const photos = page.getByRole('button', { name: 'Photos', exact: true })
  await photos.focus()
  await expect(photos).toHaveCSS('outline-style', 'solid')
  await expect(photos).toHaveCSS('outline-width', '4px')
  await expect(photos).toHaveCSS('transition-duration', '0s')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(photos).toBeVisible()
  // Capture the resting Home, not the transient action toast or entrance greeting.
  await expect(page.getByText('Opening Photos...', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Good morning!', { exact: true })).toHaveCount(0, { timeout: 25_000 })
})

test('both layouts fit at every font step, with stable saved slots and colors', async () => {
  for (const layout of ['simple4', 'more8'] as const) {
    for (let fontStep = 0; fontStep < FONT_STEPS.length; fontStep++) {
      const tiles = cards(layout === 'more8')
      // Exercise long permitted labels with the larger illustrations too.
      tiles[0]!.label = layout === 'simple4' ? 'Our favorite family pictures' : 'Family photographs'
      await configure(tiles, layout, fontStep)
      await expect
        .poll(() =>
          page.getByRole('main', { name: 'Home tiles' }).evaluate((grid) => {
            const area = grid.getBoundingClientRect()
            return Array.from(grid.querySelectorAll('button')).flatMap((button) => {
              const box = button.getBoundingClientRect()
              return button.scrollHeight > button.clientHeight + 1 ||
                button.scrollWidth > button.clientWidth + 1 ||
                box.bottom > area.bottom + 1 ||
                box.right > area.right + 1
                ? [button.getAttribute('aria-label')]
                : []
            })
          })
        )
        .toEqual([])
      for (const tile of tiles) {
        const button = page.getByRole('button', { name: tile.label, exact: true })
        await expect(button).toHaveAttribute('data-tile-slot', String(tile.slot))
        await expect(button).toHaveAttribute('style', new RegExp(`--tile${tile.colorIndex + 1}\\b`))
      }
    }
  }
  await page.screenshot({ path: `${review}/wide-largest-font.png` })
  await configure(
    [...cards(), ...cards().map((tile, i) => ({ ...tile, id: `${tile.id}-2`, slot: i + 4 }))],
    'more8',
    4
  )
  await expect(page.locator('[data-builtin-artwork]')).toHaveCount(0)
  await page.screenshot({ path: `${review}/dense-largest-font.png` })
})

test('all themes and scaled kiosk sizes render the art; overrides remain in charge', async () => {
  for (const theme of THEME_NAMES) {
    await configure(cards(), 'simple4', 0, theme)
    await expect(page.locator('[data-builtin-artwork]')).toHaveCount(4)
    if (theme === 'mint' || theme === 'evening')
      await page.screenshot({ path: `${review}/${theme}.png` })
  }
  await configure()
  const window = await app.browserWindow(page)
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1280, 720]
  ]) {
    await window.evaluate((win, size) => win.setContentSize(size[0]!, size[1]!), [width!, height!])
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
    await page.getByRole('button', { name: 'Photos', exact: true }).focus()
    await page.screenshot({ path: `${review}/kiosk-${width}.png` })
  }
  const overrides = cards()
  overrides[0]!.icon = '🌷'
  // A missing saved photo must keep its ordinary fallback, not replace the selection.
  overrides[1]!.photoId = '2ec4c9ae-6b83-4c86-b171-3863ea979f13'
  await configure(overrides)
  await expect(page.getByRole('button', { name: 'Photos', exact: true })).toContainText('🌷')
  await expect(
    page.getByRole('button', { name: 'Photos', exact: true }).locator('[data-builtin-artwork]')
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Music', exact: true }).locator('[data-builtin-artwork]')
  ).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a failed bundled image falls back to the existing vector icons', async () => {
  await configure()
  // Deliberately poison only the local image in this isolated test profile.
  await page.evaluate(() => {
    for (const img of document.querySelectorAll<HTMLImageElement>('[data-builtin-artwork]'))
      img.src = 'data:image/png;base64,broken'
  })
  await expect(page.locator('[data-builtin-artwork]')).toHaveCount(0)
  for (const label of labels) {
    const button = page.getByRole('button', { name: label, exact: true })
    await expect(button.locator('svg')).toHaveCount(1)
    await expect(button).toBeEnabled()
  }
  expect(errors).toEqual([])
})
