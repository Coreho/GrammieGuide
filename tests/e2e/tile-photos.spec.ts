import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Photo } from '../../src/shared/media/photoTypes'
import type { Tile } from '../../src/shared/configSchema'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
let photos: Photo[]
const errors: string[] = []
const names = ['Family website', 'Family app', 'Family photos']
test.describe.configure({ mode: 'serial' })

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  admin.on('pageerror', (error) => errors.push(error.message))
  await admin.waitForLoadState('domcontentloaded')
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-tile-photos-'))
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 400
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c6e4fa'
    ctx.fillRect(0, 0, 600, 400)
    ctx.fillStyle = '#71a65e'
    ctx.fillRect(0, 220, 600, 180)
    ctx.fillStyle = '#d9b984'
    ctx.fillRect(210, 140, 180, 150)
    ctx.fillStyle = '#a94936'
    ctx.beginPath()
    ctx.moveTo(190, 140)
    ctx.lineTo(300, 60)
    ctx.lineTo(410, 140)
    ctx.fill()
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const sources = [join(root, 'house.png'), join(root, 'missing.png'), join(root, 'delete.png')]
  sources.forEach((path) => writeFileSync(path, Buffer.from(image, 'base64')))
  await app.evaluate(({ dialog }, paths) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: paths }
    }
  }, sources)
  await admin.evaluate(() => window.admin.importPhotos())
  photos = await admin.evaluate(() => window.admin.listPhotos())
  await admin.evaluate(async (id) => {
    await window.admin.updatePhoto({ id, patch: { caption: 'The family house', showToHer: false } })
  }, photos[0]!.id)
  await admin.evaluate(async (labels) => {
    const tiles: Tile[] = labels.map((label, slot) => ({
      id: String(slot),
      label,
      slot,
      type: slot === 0 ? 'web' : slot === 1 ? 'app' : 'builtin',
      colorIndex: slot,
      size: 'normal',
      icon: '🌷',
      url: slot === 0 ? 'https://example.com' : undefined,
      appPath: slot === 1 ? 'C:\\Windows\\notepad.exe' : undefined,
      builtinKey: slot === 2 ? 'photos' : undefined
    }))
    await window.admin.setConfig({ tiles })
  }, names)
  // Fixture writes use the real IPC; reload the admin store after seeding them.
  await admin.reload()
  await admin.getByPlaceholder('PIN').fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
  await admin.getByRole('button', { name: 'Tiles', exact: true }).click()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('chooses and removes a library photo on web, app and built-in tiles through admin', async () => {
  for (const label of names) {
    await admin.getByRole('button', { name: `Edit ${label}`, exact: true }).click()
    const chooser = admin.getByRole('button', { name: 'Use photo: The family house', exact: true })
    await expect(chooser).toBeEnabled()
    await chooser.click()
    await expect(chooser).toHaveAttribute('aria-pressed', 'true')
    await admin.getByRole('button', { name: 'Save tile', exact: true }).click()
    const tile = page.getByRole('button', { name: label, exact: true })
    await expect(tile.locator('img')).toBeVisible()
    expect(
      await tile.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)
    ).toBeGreaterThan(0)
    await admin.getByRole('button', { name: `Edit ${label}`, exact: true }).click()
    await admin.getByRole('button', { name: 'Use icon instead', exact: true }).click()
    await admin.getByRole('button', { name: 'Save tile', exact: true }).click()
    await expect(tile.locator('img')).toHaveCount(0)
    await expect(tile).toContainText('🌷')
  }
})

test('fills the picture well and keeps whole labels readable at all five sizes in both Home layouts', async () => {
  test.setTimeout(120_000)
  for (const homeLayout of ['simple4', 'more8'] as const) {
    for (const size of [
      { width: 1264, height: 760 },
      { width: 1440, height: 900 }
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, dimensions) =>
          BrowserWindow.getAllWindows()[0]!.setContentSize(dimensions.width, dimensions.height),
        size
      )
      for (let fontStep = 0; fontStep < 5; fontStep++) {
        await admin.evaluate(
          async ({ id, homeLayout, fontStep }) => {
            const cfg = await window.admin.getConfig()
            await window.admin.setConfig({
              display: { ...cfg.display, homeLayout, fontStep },
              tiles: cfg.tiles.map((tile) => ({ ...tile, photoId: id }))
            })
          },
          { id: photos[0]!.id, homeLayout, fontStep }
        )
        const tiles = page.getByRole('main', { name: 'Home tiles' }).getByRole('button')
        await expect(tiles.locator('img')).toHaveCount(3)
        await expect
          .poll(async () =>
            tiles
              .locator('img')
              .evaluateAll((images) =>
                images.every((img) => (img as HTMLImageElement).naturalWidth > 0)
              )
          )
          .toBe(true)
        const bounds = await tiles.evaluateAll((buttons) =>
          buttons.map((button) => {
            const label = button.lastElementChild as HTMLElement
            const image = button.querySelector('img')!
            const well = image.parentElement!
            const rect = image.getBoundingClientRect()
            const box = well.getBoundingClientRect()
            return {
              readable:
                label.scrollWidth <= label.clientWidth + 1 &&
                label.scrollHeight <= label.clientHeight + 1,
              contained:
                button.scrollWidth <= button.clientWidth + 1 &&
                button.scrollHeight <= button.clientHeight + 1,
              fills: Math.abs(rect.width - box.width) < 1 && Math.abs(rect.height - box.height) < 1,
              fit: getComputedStyle(image).objectFit
            }
          })
        )
        expect(
          bounds.every(
            ({ readable, contained, fills, fit }) =>
              readable && contained && fills && fit === 'cover'
          )
        ).toBe(true)
      }
      await page.screenshot({ path: `test-results/tile-photos-${homeLayout}-${size.width}.png` })
    }
  }
})

test('a missing thumbnail uses its icon without a broken image', async () => {
  unlinkSync(join(root, 'media', 'photos', `${photos[1]!.id}.thumb.jpg`))
  await admin.evaluate(async (id) => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      tiles: cfg.tiles.map((tile) => (tile.id === '0' ? { ...tile, photoId: id } : tile))
    })
  }, photos[1]!.id)
  const tile = page.getByRole('button', { name: names[0], exact: true })
  await expect(tile.locator('img')).toHaveCount(0)
  await expect(tile).toContainText('🌷')
})

test('deleting a photo updates Home immediately and preserves the icon and tile position', async () => {
  await admin.evaluate(async (id) => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      tiles: cfg.tiles.map((tile) => (tile.id === '0' ? { ...tile, photoId: id } : tile))
    })
  }, photos[2]!.id)
  const tile = page.getByRole('button', { name: names[0], exact: true })
  await expect(tile.locator('img')).toBeVisible()
  await admin.evaluate((id) => window.admin.removePhoto(id), photos[2]!.id)
  await expect(tile.locator('img')).toHaveCount(0)
  await expect(tile).toContainText('🌷')
  await expect(tile).toHaveAttribute('data-tile-slot', '0')
  await expect(admin.getByRole('button', { name: 'Use photo: Photo 3', exact: true })).toHaveCount(
    0
  )
})

test('a saved selection survives restart and invalid photo paths change nothing', async () => {
  await admin.evaluate(async (id) => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({ tiles: cfg.tiles.map((tile) => ({ ...tile, photoId: id })) })
    try {
      await window.admin.setConfig({
        tiles: [{ ...cfg.tiles[0]!, photoId: 'file:///private.jpg' }]
      })
    } catch {
      /* expected schema rejection */
    }
  }, photos[0]!.id)
  await app.close()
  await launch()
  await expect(page.getByRole('main', { name: 'Home tiles' }).locator('img')).toHaveCount(3)
  await expect
    .poll(async () =>
      page
        .getByRole('main', { name: 'Home tiles' })
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0)
        )
    )
    .toBe(true)
  const cfg = await page.evaluate(() => window.launcher.getConfig())
  expect(cfg.tiles).toHaveLength(3)
  expect(cfg.tiles.every((tile) => tile.photoId === photos[0]!.id)).toBe(true)
  expect(errors).toEqual([])
})
