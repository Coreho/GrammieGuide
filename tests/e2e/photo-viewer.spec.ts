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
let folder: string
let entries: LibraryEntry[]
const captions = ['The garden in summer', 'The little house by the lake', 'A sunny afternoon']
const rendererErrors: string[] = []

test.describe.configure({ mode: 'serial' })

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  await admin.waitForLoadState('domcontentloaded')
}

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'grammieguide-viewer-'))
  folder = join(userData, 'media', 'photos')
  mkdirSync(folder, { recursive: true })
  const config = defaultConfig()
  config.buddy.motion = 'reduced'
  config.tiles = [
    {
      id: 'photos',
      type: 'builtin',
      builtinKey: 'photos',
      label: 'Family photos',
      size: 'normal',
      colorIndex: 0,
      slot: 0
    }
  ]
  writeFileSync(join(userData, 'grammieguide-config.json'), JSON.stringify(config))
  await launch()
  // Synthetic garden illustrations are test pictures, never production assets.
  const pictures = await page.evaluate(() =>
    [0, 1, 2].map((scene) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 800
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#b4d6f0'
      ctx.fillRect(0, 0, 1200, 800)
      ctx.fillStyle = '#71976a'
      ctx.fillRect(0, 440, 1200, 360)
      ctx.fillStyle = ['#e5c99a', '#a6c0ce', '#d9ad9c'][scene]!
      ctx.fillRect(420, 260, 360, 300)
      ctx.fillStyle = '#993420'
      ctx.beginPath()
      ctx.moveTo(380, 260)
      ctx.lineTo(600, 110)
      ctx.lineTo(820, 260)
      ctx.fill()
      ctx.fillStyle = '#345060'
      ctx.fillRect(560, 400, 80, 160)
      ctx.fillRect(460, 320, 60, 80)
      ctx.fillRect(680, 320, 60, 80)
      ctx.fillStyle = '#365a3b'
      for (const x of [180, 1020]) {
        ctx.beginPath()
        ctx.arc(x, 390, 120, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#ffd268'
      ctx.beginPath()
      ctx.arc(1040, 120, 65, 0, Math.PI * 2)
      ctx.fill()
      return canvas.toDataURL('image/png')
    })
  )
  const jpegs = await app.evaluate(
    ({ nativeImage }, images) =>
      images.map((url) => {
        const image = nativeImage.createFromDataURL(url)
        return {
          full: image.toJPEG(85).toString('base64'),
          thumb: image.resize({ width: 320 }).toJPEG(85).toString('base64')
        }
      }),
    pictures
  )
  entries = jpegs.map((image, order) => {
    const id = randomUUID()
    const fileName = `${id}.jpg`
    const thumbFileName = `${id}.thumb.jpg`
    writeFileSync(join(folder, fileName), Buffer.from(image.full, 'base64'))
    writeFileSync(join(folder, thumbFileName), Buffer.from(image.thumb, 'base64'))
    return {
      id,
      fileName,
      thumbFileName,
      metadata: { caption: captions[order]!, showToHer: true, order }
    }
  })
  const hidden = randomUUID()
  entries.push({
    id: hidden,
    fileName: `${hidden}.jpg`,
    metadata: { caption: 'PRIVATE FAMILY NOTE', showToHer: false, order: 0 }
  })
  const missing = randomUUID()
  entries.push({
    id: missing,
    fileName: `${missing}.jpg`,
    metadata: { caption: 'Missing picture', showToHer: false, order: 3 }
  })
  writeFileSync(join(folder, 'index.json'), JSON.stringify({ entries }))
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-12T12:00:01Z'))
})

test.afterEach(async () => {
  if (await page.getByRole('dialog', { name: 'Family photos' }).count()) {
    await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  }
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (userData) rmSync(userData, { recursive: true, force: true, maxRetries: 3 })
  }
})

async function openViewer(): Promise<void> {
  await page.getByRole('button', { name: 'Family photos', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Family photos' })).toBeVisible()
}

async function imageLoaded(): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator('.photo-viewer-picture img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
    )
    .toBe(true)
}

test('caregiver creates a Photos tile by name and opens its registered viewer', async () => {
  await admin.getByRole('button', { name: 'Tiles', exact: true }).click()
  await admin.getByLabel('Tile type').selectOption('builtin')
  const feature = admin.getByLabel('Built-in feature')
  await expect(feature.locator('option[value="photos"]')).toHaveText('Photos')
  await feature.selectOption({ label: 'Photos' })
  await expect(admin.getByLabel('Tile label')).toHaveValue('Photos')
  await admin.getByLabel('Tile label').fill('Our family album')
  await feature.selectOption('weather')
  await expect(admin.getByLabel('Tile label')).toHaveValue('Our family album')
  await feature.selectOption('photos')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await page.getByRole('button', { name: 'Our family album', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Our family album' })).toBeVisible()
  await imageLoaded()
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({ tiles: config.tiles.filter((tile) => tile.id === 'photos') })
  })
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
})

test('opens locally while offline, pages through visible photos, and keeps their captions private', async () => {
  await page.context().setOffline(true)
  await openViewer()
  await imageLoaded()
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Next photo', exact: true }).click()
  await expect(page.getByText(captions[1]!, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous photo', exact: true }).click()
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText(captions[2]!, { exact: true })).toBeVisible()
  await expect(page.getByText('PRIVATE FAMILY NOTE')).toHaveCount(0)
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(log.some((event) => event.type === 'photos-viewer-opened')).toBe(true)
  const logged = JSON.stringify(log)
  for (const caption of [...captions, 'PRIVATE FAMILY NOTE']) expect(logged).not.toContain(caption)
  expect(logged).not.toContain(userData)
  await imageLoaded()
  await page.screenshot({ path: test.info().outputPath('photo-viewer.png') })
  expect(rendererErrors).toEqual([])
})

test('never advances automatically with the caregiver slideshow setting off', async () => {
  await openViewer()
  await imageLoaded()
  await page.clock.fastForward(120_000)
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pause photos|Play photos/ })).toHaveCount(0)
})

test('caregiver enables slow advances; manual paging resets the wait and she can pause', async () => {
  await admin.getByRole('checkbox', { name: /Gentle slideshow/ }).check()
  await expect
    .poll(() => admin.evaluate(() => window.admin.getConfig()))
    .toHaveProperty('photos.slideshowEnabled', true)
  await openViewer()
  await imageLoaded()
  await page.clock.fastForward(29_000)
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await page.clock.fastForward(2_000)
  await expect(page.getByText(captions[1]!, { exact: true })).toBeVisible()
  await imageLoaded()
  await page.clock.fastForward(28_000)
  await page.getByRole('button', { name: 'Previous photo', exact: true }).click()
  await imageLoaded()
  await page.clock.fastForward(3_000)
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause photos', exact: true }).click()
  await page.clock.fastForward(90_000)
  await expect(page.getByText(captions[0]!, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play photos', exact: true }).click()
  await page.clock.fastForward(31_000)
  await expect(page.getByText(captions[1]!, { exact: true })).toBeVisible()
  await admin.getByRole('checkbox', { name: /Gentle slideshow/ }).uncheck()
  await expect(page.getByRole('button', { name: 'Pause photos', exact: true })).toHaveCount(0)
  await page.clock.fastForward(60_000)
  await expect(page.getByText(captions[1]!, { exact: true })).toBeVisible()
})

test('closing the viewer cancels its pending slideshow timer', async () => {
  await admin.getByRole('checkbox', { name: /Gentle slideshow/ }).check()
  await expect
    .poll(() => admin.evaluate(() => window.admin.getConfig()))
    .toHaveProperty('photos.slideshowEnabled', true)
  await page.evaluate(() => {
    const pending = new Set<number>()
    const original = window.setTimeout.bind(window)
    const clear = window.clearTimeout.bind(window)
    window.setTimeout = (handler, delay, ...args) => {
      const timer = original(handler, delay, ...args)
      if (delay === 30_000) pending.add(timer)
      return timer
    }
    window.clearTimeout = (timer) => {
      if (timer !== undefined) pending.delete(timer)
      clear(timer)
    }
    ;(
      window as unknown as { photoTimerProbe: { pending: Set<number>; restore: () => void } }
    ).photoTimerProbe = {
      pending,
      restore: () => {
        window.setTimeout = original
        window.clearTimeout = clear
      }
    }
  })
  try {
    await openViewer()
    await imageLoaded()
    const pending = (): Promise<number> =>
      page.evaluate(
        () =>
          (window as unknown as { photoTimerProbe: { pending: Set<number> } }).photoTimerProbe
            .pending.size
      )
    await expect.poll(pending).toBe(1)
    await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
    await expect.poll(pending).toBe(0)
    await page.clock.fastForward(120_000)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await page.evaluate(() =>
      (window as unknown as { photoTimerProbe: { restore: () => void } }).photoTimerProbe.restore()
    )
    await admin.getByRole('checkbox', { name: /Gentle slideshow/ }).uncheck()
  }
})

test('keyboard focus stays inside the viewer and Escape returns focus to her tile', async () => {
  await openViewer()
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Next photo', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeFocused()
  await expect(page.getByRole('dialog').locator('input, select, textarea')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Family photos', exact: true })).toBeFocused()
})

test('a missing picture stays calm, stops automatic advances, and lets her go back', async () => {
  await admin.evaluate(
    (id) => window.admin.updatePhoto({ id, patch: { showToHer: true } }),
    entries[4]!.id
  )
  await admin.getByRole('checkbox', { name: /Gentle slideshow/ }).check()
  await expect
    .poll(() => admin.evaluate(() => window.admin.getConfig()))
    .toHaveProperty('photos.slideshowEnabled', true)
  await openViewer()
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Next photo', exact: true }).click()
  }
  await expect(page.getByText("This photo isn't ready right now.", { exact: true })).toBeVisible()
  await page.clock.fastForward(120_000)
  await expect(page.getByText("This photo isn't ready right now.", { exact: true })).toBeVisible()
  await expect(page.getByText('Missing picture', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Previous photo', exact: true }).click()
  await imageLoaded()
  await expect(page.getByText(captions[2]!, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await admin.evaluate(
    (id) => window.admin.updatePhoto({ id, patch: { showToHer: false } }),
    entries[4]!.id
  )
  await admin.getByRole('checkbox', { name: /Gentle slideshow/ }).uncheck()
})

test('an empty collection has a gentle message and both Home and Back return to Home', async () => {
  for (const entry of entries.slice(0, 3)) {
    await admin.evaluate(
      (id) => window.admin.updatePhoto({ id, patch: { showToHer: false } }),
      entry.id
    )
  }
  await openViewer()
  await expect(
    page.getByText('Your photos will be here when your family adds them.', { exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await openViewer()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const entry of entries.slice(0, 3)) {
    await admin.evaluate(
      (id) => window.admin.updatePhoto({ id, patch: { showToHer: true } }),
      entry.id
    )
  }
})

test('picture and controls fit at every text size, including a long caption', async () => {
  const caption = 'A familiar garden with flowers beside the path. '.repeat(25)
  await admin.evaluate(({ id, caption }) => window.admin.updatePhoto({ id, patch: { caption } }), {
    id: entries[0]!.id,
    caption
  })
  const window = await app.browserWindow(page)
  for (const size of [
    { width: 1264, height: 760 },
    { width: 1440, height: 900 }
  ]) {
    await window.evaluate((window, size) => window.setSize(size.width, size.height), size)
    for (let fontStep = 0; fontStep < 5; fontStep += 1) {
      await admin.evaluate(async (fontStep) => {
        const config = await window.admin.getConfig()
        await window.admin.setConfig({ display: { ...config.display, fontStep } })
      }, fontStep)
      await openViewer()
      await imageLoaded()
      await expect(page.locator('.photo-viewer-caption')).toHaveText(caption)
      const bounds = await page.evaluate(() => {
        const image = document.querySelector('.photo-viewer-picture')!.getBoundingClientRect()
        const controls = [...document.querySelectorAll('.photo-viewer button')].map((button) =>
          button.getBoundingClientRect()
        )
        return {
          height: innerHeight,
          width: innerWidth,
          imageHeight: image.height,
          controls: controls.map(({ top, bottom, left, right, height }) => ({
            top,
            bottom,
            left,
            right,
            height
          }))
        }
      })
      expect(bounds.imageHeight).toBeGreaterThan(200)
      for (const control of bounds.controls) {
        expect(control.height).toBeGreaterThanOrEqual(80)
        expect(control.top).toBeGreaterThanOrEqual(0)
        expect(control.bottom).toBeLessThanOrEqual(bounds.height)
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(bounds.width)
      }
      if (fontStep === 4)
        await page.screenshot({
          path: test.info().outputPath(`photo-viewer-${size.width}-large-text.png`)
        })
      await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
    }
  }
  expect(rendererErrors).toEqual([])
})

test('an unreadable library shows a calm line with usable Home and Back', async () => {
  await app.close()
  rmSync(join(folder, 'index.json'))
  mkdirSync(join(folder, 'index.json'))
  await launch()
  await openViewer()
  await expect(page.getByText("The photos aren't ready right now.", { exact: true })).toBeVisible()
  const text = await page.getByRole('dialog').innerText()
  expect(text).not.toMatch(/EISDIR|Error invoking|grammie-media|index\.json/)
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
