import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let admin: Page
let server: Server
let base: string
const errors: string[] = []
const review = '.impeccable/review/news'
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  mkdirSync(review, { recursive: true })
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end(
      `<!doctype html><title>News fixture ${request.url}</title><body style="margin:0;background:#f5ecd9;font:32px Georgia;color:#30291f"><header style="padding:36px;background:#30291f;color:white">Daily News ${request.url}</header><h1 style="padding:28px">A new reading garden</h1><p style="padding:28px">Stories from our community.</p><a href="/next">Another story</a></body>`
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-news-shelf-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  const opened = app.waitForEvent('window')
  await app.evaluate(() =>
    (
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  )
  admin = await opened
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

test('new News tiles default to the approved three website choices; previews close their renderers', async () => {
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('news')
  await expect(admin.getByLabel('News layout')).toHaveValue('sites')
  for (const [index, name] of ['Yahoo News', 'BBC News', 'NBC News'].entries()) {
    await expect(admin.getByLabel(`Source ${index + 1} name`)).toHaveValue(name)
    await admin
      .getByLabel(`Source ${index + 1} website`)
      .fill(`${base}/${['yahoo', 'bbc', 'nbc'][index]}`)
  }
  await admin.getByLabel('Source 1 website').fill('javascript:alert(1)')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(admin.getByRole('alert')).toContainText('complete http:// or https://')
  await admin.getByLabel('Source 1 website').fill(`${base}/yahoo`)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await page.getByRole('button', { name: 'News', exact: true }).click()
  const shelf = page.getByRole('dialog', { name: 'News' })
  await expect(shelf.locator('.news-source-card')).toHaveText([
    'Yahoo News',
    'BBC News',
    'NBC News'
  ])
  await expect(shelf.getByRole('button', { name: 'Back to Home', exact: true })).toBeFocused()
  await expect(shelf.locator('.news-source-preview img')).toHaveCount(3, { timeout: 40_000 })
  for (const image of await shelf.locator('.news-source-preview img').all()) {
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)
  }
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(2)
  await page.screenshot({ path: join(review, 'shelf.png') })
})

test('each card opens only its saved site; Back returns to the shelf and Home closes the page', async () => {
  for (const [label, path] of [
    ['Yahoo News', 'yahoo'],
    ['BBC News', 'bbc'],
    ['NBC News', 'nbc']
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect
      .poll(() =>
        app.evaluate(({ webContents }) => webContents.getAllWebContents().map((wc) => wc.getURL()))
      )
      .toContain(`${base}/${path}`)
    await page.getByRole('button', { name: '← Back', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'News' })).toBeVisible()
    await expect
      .poll(() =>
        app.evaluate(({ webContents }) =>
          webContents.getAllWebContents().some((wc) => wc.getURL().startsWith('http://127.0.0.1:'))
        )
      )
      .toBe(false)
  }
  const rejected = await page.evaluate(async () => {
    const tile = (await window.launcher.getConfig()).tiles.find(
      (tile) => tile.builtinKey === 'news'
    )!
    return window.launcher.openNewsSource(tile.id, 'https://unapproved.test/')
  })
  expect(rejected.ok).toBe(false)
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(log.some((entry) => entry.type === 'news-site-opened')).toBe(true)
  expect(JSON.stringify(log)).not.toContain(`${base}/`)
  await page.getByRole('button', { name: 'BBC News', exact: true }).click()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'News', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('largest text and keyboard controls fit; failed previews leave usable named choices', async () => {
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      display: { ...cfg.display, fontStep: 4, theme: 'clayCards' },
      tiles: cfg.tiles.map((tile) =>
        tile.builtinKey === 'news'
          ? {
              ...tile,
              newsSources: tile.newsSources!.map((source) => ({
                ...source,
                url: 'http://127.0.0.1:1/unavailable'
              }))
            }
          : tile
      )
    })
  })
  await page.getByRole('button', { name: 'News', exact: true }).click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Yahoo News', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'BBC News', exact: true })).toBeFocused()
  const fits = await page
    .locator('.news-source-card')
    .evaluateAll((cards) =>
      cards.every(
        (card) => card.scrollWidth <= card.clientWidth && card.scrollHeight <= card.clientHeight
      )
    )
  expect(fits).toBe(true)
  await expect(page.locator('.news-source-preview img')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'NBC News', exact: true })).toBeEnabled()
  await page.screenshot({ path: join(review, 'shelf-large-text-offline.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'News', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})
