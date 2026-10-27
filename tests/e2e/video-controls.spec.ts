import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

test('video controls follow the player, retain Home in fullscreen, and close media', async () => {
  const media = readFileSync('tests/fixtures/video.webm')
  const server = createServer((req, res) => {
    if (req.url === '/tone.webm') {
      res.setHeader('Content-Type', 'video/webm')
      res.end(media)
    } else {
      res.setHeader('Content-Type', 'text/html')
      res.end('<title>Video fixture</title><video controls loop src="/tone.webm"></video>')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/watch`
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'gg-video-'))}`],
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const opened = app.waitForEvent('window')
    await app.evaluate((_electron, fixture) => {
      ;(
        globalThis as unknown as {
          __e2e__: { createAdminWindow(): void; setVideoFixtureForTests(url: string): void }
        }
      ).__e2e__.setVideoFixtureForTests(fixture)
      ;(
        globalThis as unknown as { __e2e__: { createAdminWindow(): void } }
      ).__e2e__.createAdminWindow()
    }, url)
    const admin = await opened
    await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
    await admin.getByPlaceholder('Confirm PIN').fill('2468')
    await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
    await admin.getByLabel('Tile type').selectOption('web')
    await admin.getByLabel('Tile label').fill('Videos')
    await admin.getByLabel('Website address').fill(url)
    await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
    await page.getByRole('button', { name: 'Videos', exact: true }).click()
    const toolbar = page.getByRole('toolbar', { name: 'Video controls' })
    await expect(toolbar).toBeVisible()
    const home = page.getByRole('button', { name: '🏠 Home', exact: true })
    const bounds = await home.boundingBox()
    await toolbar.getByRole('button', { name: '▶ Play', exact: true }).click()
    await expect(toolbar.getByRole('button', { name: 'Ⅱ Pause' })).toBeVisible()
    await toolbar.getByRole('button', { name: 'Ⅱ Pause' }).click()
    await expect(toolbar.getByRole('button', { name: '▶ Play', exact: true })).toBeVisible()
    await app.evaluate(async ({ webContents }, fixture) => {
      await webContents
        .getAllWebContents()
        .find((w) => w.getURL() === fixture)!
        .executeJavaScript('document.querySelector("video").currentTime = 12')
    }, url)
    await toolbar.getByRole('button', { name: '↶ Back 10 seconds' }).click()
    await expect
      .poll(() =>
        app.evaluate(
          async ({ webContents }, fixture) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL() === fixture)!
              .executeJavaScript('document.querySelector("video").currentTime'),
          url
        )
      )
      .toBeLessThan(3)
    await toolbar.getByRole('button', { name: 'Full screen', exact: true }).focus()
    await toolbar.getByRole('button', { name: 'Full screen', exact: true }).press('Enter')
    await expect(toolbar.getByRole('button', { name: 'Smaller video' })).toBeVisible()
    expect(await home.boundingBox()).toEqual(bounds)
    await toolbar.getByRole('button', { name: 'Smaller video' }).focus()
    await toolbar.getByRole('button', { name: 'Smaller video' }).press('Space')
    await expect(toolbar.getByRole('button', { name: 'Full screen', exact: true })).toBeVisible()
    for (let step = 0; step < 5; step++) {
      await admin.evaluate(async (fontStep) => {
        const config = await window.admin.getConfig()
        await window.admin.setConfig({ display: { ...config.display, fontStep } })
      }, step)
      await expect.poll(() => toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    await page.screenshot({ path: 'test-results/video-controls.png' })
    await app.evaluate(async ({ webContents }, fixture) => {
      await webContents
        .getAllWebContents()
        .find((w) => w.getURL() === fixture)!
        .executeJavaScript('document.querySelector("video").remove()')
    }, url)
    await expect(toolbar).toHaveCount(0)
    expect(await page.evaluate(() => window.launcher.videoCommand('play'))).toBe(false)
    await home.click()
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, fixture) =>
            webContents.getAllWebContents().some((w) => w.getURL() === fixture),
          url
        )
      )
      .toBe(false)
    // Quitting the app with a live native view must also close cleanly. The
    // host's closed event can arrive after Electron has destroyed its chrome.
    await page.getByRole('button', { name: 'Videos', exact: true }).click()
    await expect(toolbar).toBeVisible()
  } finally {
    await app.close()
    server.close()
  }
})
