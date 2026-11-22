import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'
import type { LibraryEntry } from '../../src/shared/media/libraryTypes'

let app: ElectronApplication
let page: Page
let admin: Page
let userData: string
let entries: LibraryEntry[]
const rendererErrors: string[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'grammieguide-albums-'))
  const folder = join(userData, 'media', 'photos')
  mkdirSync(folder, { recursive: true })
  const config = defaultConfig()
  config.buddy.motion = 'reduced'
  config.tiles = [
    {
      id: 'photos',
      type: 'builtin',
      builtinKey: 'photos',
      label: 'Photos',
      size: 'normal',
      colorIndex: 0,
      slot: 0
    }
  ]
  writeFileSync(join(userData, 'grammieguide-config.json'), JSON.stringify(config))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  // Plain colored squares are test pictures, never production assets.
  const jpegs = await app.evaluate(({ nativeImage }) =>
    ['#b4d6f0', '#e5c99a', '#71976a'].map((color) => {
      const size = 64
      const pixels = Buffer.alloc(size * size * 4)
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16))
      for (let i = 0; i < pixels.length; i += 4) pixels.set([b!, g!, r!, 255], i)
      const image = nativeImage.createFromBitmap(pixels, { width: size, height: size })
      return image.toJPEG(85).toString('base64')
    })
  )
  // Two photos from before albums (no album at all) and one in the New album.
  entries = jpegs.map((jpeg, order) => {
    const id = randomUUID()
    writeFileSync(join(folder, `${id}.jpg`), Buffer.from(jpeg, 'base64'))
    writeFileSync(join(folder, `${id}.thumb.jpg`), Buffer.from(jpeg, 'base64'))
    return {
      id,
      fileName: `${id}.jpg`,
      thumbFileName: `${id}.thumb.jpg`,
      metadata: {
        caption: '',
        showToHer: true,
        order,
        ...(order === 2 ? { album: 'New' } : {})
      }
    }
  })
  writeFileSync(join(folder, 'index.json'), JSON.stringify({ entries }))
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
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (userData) rmSync(userData, { recursive: true, force: true, maxRetries: 3 })
  }
  expect(rendererErrors).toEqual([])
})

const viewer = (): ReturnType<Page['getByRole']> => page.getByRole('dialog', { name: 'Photos' })
const picture = (): ReturnType<Page['locator']> => page.locator('.photo-viewer-picture img')

test('with two albums she chooses one first, pages only that album, and goes back to the choice', async () => {
  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(viewer()).toBeVisible()
  const choice = page.getByRole('list', { name: 'Choose an album' })
  await expect(choice.getByRole('button')).toHaveText([/My photos\s*2 photos/, /New\s*1 photo/])
  await expect(page.getByRole('button', { name: 'Next photo' })).toHaveCount(0)

  await choice.getByRole('button', { name: /New/ }).click()
  await expect(viewer().getByRole('heading', { level: 1 })).toHaveText('New')
  await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entries[2]!.fileName}`)
  // One photo: no Next, and Back goes to the albums rather than Home.
  await expect(page.getByRole('button', { name: 'Next photo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to the albums' }).click()
  await expect(choice).toBeVisible()

  await choice.getByRole('button', { name: /My photos/ }).click()
  await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entries[0]!.fileName}`)
  await page.getByRole('button', { name: 'Next photo' }).click()
  await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entries[1]!.fileName}`)
  // Only this album's photos: Next wraps to its first photo, never into New.
  await page.getByRole('button', { name: 'Next photo' }).click()
  await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entries[0]!.fileName}`)
  await page.getByRole('button', { name: '← Albums', exact: true }).click()
  await expect(choice).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(viewer()).toHaveCount(0)
})

test('the caregiver sees albums, filters by one, and moving the last New photo leaves one album that opens directly', async () => {
  await expect(admin.getByLabel('Show album')).toContainText('New (1)')
  await admin.getByLabel('Show album').selectOption({ label: 'New (1)' })
  const editors = admin.locator('.photo-editor')
  await expect(editors).toHaveCount(1)
  await expect(editors.getByLabel('Album')).toHaveValue('New')

  // She is looking at the New album while the caregiver moves its only photo.
  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await page
    .getByRole('list', { name: 'Choose an album' })
    .getByRole('button', { name: /New/ })
    .click()
  await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entries[2]!.fileName}`)

  await editors.getByLabel('Album').fill('')
  await editors.getByRole('button', { name: 'Save changes' }).click()
  // The filter falls back to every photo once New is empty, so find the saved line itself.
  await expect(admin.getByText('Saved.', { exact: true })).toBeVisible()

  // One album left: no choice, straight to its photos, with all three in it.
  await expect(page.getByRole('list', { name: 'Choose an album' })).toHaveCount(0)
  await expect(viewer().getByRole('heading', { level: 1 })).toHaveText('Photos')
  await expect(page.getByRole('button', { name: '← Albums', exact: true })).toHaveCount(0)
  await expect(picture()).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entries[0]!.fileName}`)
  for (const entry of [entries[1]!, entries[2]!, entries[0]!]) {
    await page.getByRole('button', { name: 'Next photo' }).click()
    await expect(picture()).toHaveAttribute('src', `grammie-media://photos/${entry.fileName}`)
  }
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})
