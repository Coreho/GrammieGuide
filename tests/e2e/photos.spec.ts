import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Photo, PhotoImportProgress } from '../../src/shared/media/photoTypes'

let app: ElectronApplication
let launcher: Page
let admin: Page
let root: string
let userData: string
let sources: string[]
let imported: Photo[]
const rendererErrors: string[] = []

test.describe.configure({ mode: 'serial' })

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  launcher = await app.firstWindow()
  launcher.on('pageerror', (error) => rendererErrors.push(error.message))
  await launcher.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  admin.on('pageerror', (error) => rendererErrors.push(error.message))
  await admin.waitForLoadState('domcontentloaded')
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-photos-'))
  userData = join(root, 'profile')
  const originals = join(root, 'originals')
  mkdirSync(originals)
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(admin.getByText('No photos yet.', { exact: false })).toBeVisible()

  // Chromium supplies real input formats, so the test exercises the installed
  // Windows WebP decoder rather than replacing the photo codec with a mock.
  const fixtures = await launcher.evaluate(() => {
    return [
      { name: 'landscape.jpg', type: 'image/jpeg', width: 2400, height: 1800 },
      { name: 'portrait.png', type: 'image/png', width: 1800, height: 2400 },
      { name: 'square.webp', type: 'image/webp', width: 2000, height: 2000 }
    ].map((fixture) => {
      const canvas = document.createElement('canvas')
      canvas.width = fixture.width
      canvas.height = fixture.height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#d06020'
      context.fillRect(0, 0, canvas.width, canvas.height)
      return { name: fixture.name, data: canvas.toDataURL(fixture.type).split(',')[1]! }
    })
  })
  sources = fixtures.map(({ name, data }) => {
    const path = join(originals, name)
    writeFileSync(path, Buffer.from(data, 'base64'))
    return path
  })
  const broken = join(originals, 'broken.png')
  writeFileSync(broken, 'not an image')
  sources.splice(1, 0, broken)
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('imports JPG, PNG and WebP, continues after a bad decode, and reports batch progress', async () => {
  await admin.evaluate(() => {
    const progress: PhotoImportProgress[] = []
    ;(window as unknown as { photoProgress: PhotoImportProgress[] }).photoProgress = progress
    window.admin.onPhotoImportProgress((count) => progress.push(count))
    const rendered: string[] = []
    ;(window as unknown as { photoStatus: string[] }).photoStatus = rendered
    const status = document.querySelector('.photos-tab [role="status"]')!
    const observer = new MutationObserver(() => rendered.push(status.textContent ?? ''))
    observer.observe(status, { childList: true, subtree: true, characterData: true })
  })
  // Only the native picker is replaced. The button, preload, IPC, native codec,
  // managed files, progress events and Photos cards all run normally.
  await app.evaluate(({ dialog }, paths) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: paths }
    }
  }, sources)
  await admin.getByRole('button', { name: 'Add photos…', exact: true }).click()
  await expect(admin.getByText(/^3 imported, 1 failed\./)).toBeVisible({ timeout: 20_000 })
  await expect(admin.locator('.photo-editor')).toHaveCount(3)
  const progress = await admin.evaluate(
    () => (window as unknown as { photoProgress: PhotoImportProgress[] }).photoProgress
  )
  expect(progress.map((count) => count.completed)).toEqual([0, 1, 2, 3, 4])
  expect(progress.at(-1)).toEqual({ total: 4, completed: 4, imported: 3, failed: 1 })
  const rendered = await admin.evaluate(
    () => (window as unknown as { photoStatus: string[] }).photoStatus
  )
  expect(rendered.some((text) => /Processed \d of 4/.test(text))).toBe(true)
  imported = await admin.evaluate(() => window.admin.listPhotos())
  expect(await launcher.evaluate(() => window.launcher.listPhotos())).toEqual(imported)
  expect(JSON.stringify(imported)).not.toContain(root)
})

test('saves real JPEGs and thumbnails with the correct longer-edge dimensions and picture content', async () => {
  const dimensions = await admin.evaluate(async (photos) => {
    const results = []
    for (const photo of photos) {
      const sizes = []
      for (const url of [photo.url, photo.thumbnailUrl]) {
        const image = new Image()
        image.src = url
        await image.decode()
        sizes.push({
          width: image.naturalWidth,
          height: image.naturalHeight
        })
      }
      results.push(sizes)
    }
    return results
  }, imported)
  expect(dimensions.map((sizes) => sizes.map(({ width, height }) => [width, height]))).toEqual([
    [
      [1600, 1200],
      [320, 240]
    ],
    [
      [1200, 1600],
      [240, 320]
    ],
    [
      [1600, 1600],
      [320, 320]
    ]
  ])
  // Inspect pixels in main: drawing grammie-media images into a renderer canvas
  // correctly taints it, and this test must not loosen the protocol's isolation.
  const pixels = await app.evaluate(
    ({ nativeImage }, input) => {
      const sample = (path: string): number[] => [
        ...nativeImage.createFromPath(path).resize({ width: 1, height: 1 }).toBitmap()
      ]
      return {
        original: sample(input.original),
        saved: input.paths.map(sample)
      }
    },
    {
      original: sources[0]!,
      paths: imported.flatMap((photo) =>
        [photo.url, photo.thumbnailUrl].map((url) =>
          join(userData, 'media', 'photos', new URL(url).pathname.slice(1))
        )
      )
    }
  )
  for (const pixel of pixels.saved) {
    // A Shell file icon is not a decoded photo; compare with the known picture.
    expect(pixel).toHaveLength(4)
    for (let channel = 0; channel < 4; channel += 1) {
      expect(Math.abs(pixel[channel]! - pixels.original[channel]!)).toBeLessThanOrEqual(3)
    }
  }
  for (const photo of imported) {
    expect(photo.url).toMatch(/\.jpg$/)
    expect(photo.thumbnailUrl).toMatch(/\.thumb\.jpg$/)
  }
})

test('saves captions, visibility and caregiver order through the Photos cards', async () => {
  const cards = admin.locator('.photo-editor')
  const first = cards.nth(0)
  await first.getByLabel('Caption (optional)').fill('Family in the garden')
  await first.getByRole('switch', { name: 'Show to her' }).uncheck()
  await first.getByLabel('Order', { exact: true }).fill('10')
  await first.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(cards.nth(2).getByLabel('Caption (optional)')).toHaveValue('Family in the garden')
  await expect(cards.nth(2).getByText('Saved.', { exact: true })).toBeVisible()
  const second = cards.nth(0)
  await second.getByLabel('Caption (optional)').fill('A happy afternoon')
  await second.getByRole('button', { name: 'Save changes', exact: true }).click()
  const all = await admin.evaluate(() => window.admin.listPhotos())
  expect(all.map((photo) => photo.id)).toEqual([imported[1]!.id, imported[2]!.id, imported[0]!.id])
  expect(all.at(-1)).toMatchObject({ caption: 'Family in the garden', showToHer: false, order: 10 })
  const visible = await launcher.evaluate(() => window.launcher.listPhotos())
  expect(visible.map((photo) => photo.id)).toEqual([imported[1]!.id, imported[2]!.id])
  expect(visible[0]!.caption).toBe('A happy afternoon')
  await admin.screenshot({ path: test.info().outputPath('photos-admin.png'), fullPage: true })
  expect(rendererErrors).toEqual([])
})

test('retains metadata and visible-only order after restarting the app', async () => {
  const before = await admin.evaluate(() => window.admin.listPhotos())
  await app.close()
  await launch()
  await admin.getByPlaceholder('Enter PIN').fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(admin.locator('.photo-editor')).toHaveCount(3)
  expect(await admin.evaluate(() => window.admin.listPhotos())).toEqual(before)
  expect(await launcher.evaluate(() => window.launcher.listPhotos())).toEqual(
    before.filter((photo) => photo.showToHer)
  )
})

test('removes a photo and both managed images through the Photos card, keeping originals', async () => {
  const originalBytes = sources.map((path) => readFileSync(path))
  const last = admin.locator('.photo-editor').nth(2)
  // Confirm dialogs are native modal UI in Electron. Replace only its answer;
  // the button and the real IPC, store update and file removal still execute.
  await admin.evaluate(() => {
    window.confirm = () => false
  })
  await last.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(admin.locator('.photo-editor')).toHaveCount(3)
  await admin.evaluate(() => {
    window.confirm = () => true
  })
  await last.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(admin.locator('.photo-editor')).toHaveCount(2)
  const photo = imported[0]!
  for (const url of [photo.url, photo.thumbnailUrl]) {
    expect(existsSync(join(userData, 'media', 'photos', new URL(url).pathname.slice(1)))).toBe(
      false
    )
  }
  sources.forEach((path, index) => expect(readFileSync(path)).toEqual(originalBytes[index]))
  expect((await admin.evaluate(() => window.admin.listPhotos())).map((photo) => photo.id)).toEqual([
    imported[1]!.id,
    imported[2]!.id
  ])
})

test('rejects photo management while locked and exposes only visible listing to Home', async () => {
  await admin.getByRole('button', { name: 'Lock', exact: true }).click()
  for (const operation of ['list', 'import', 'update', 'remove'] as const) {
    await expect(
      admin.evaluate(
        async ({ operation, id }) => {
          if (operation === 'list') return window.admin.listPhotos()
          if (operation === 'import') return window.admin.importPhotos()
          if (operation === 'update')
            return window.admin.updatePhoto({ id, patch: { caption: 'No' } })
          return window.admin.removePhoto(id)
        },
        { operation, id: imported[1]!.id }
      )
    ).rejects.toThrow('admin unlock required')
  }
  const keys = await launcher.evaluate(() => Object.keys(window.launcher))
  expect(keys).toContain('listPhotos')
  for (const key of ['importPhotos', 'updatePhoto', 'removePhoto']) expect(keys).not.toContain(key)
  expect(await launcher.evaluate(() => window.launcher.listPhotos())).toHaveLength(2)
  expect(rendererErrors).toEqual([])
})
