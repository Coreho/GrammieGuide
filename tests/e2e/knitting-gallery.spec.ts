import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Tile } from '../../src/shared/configSchema'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
const errors: string[] = []
test.describe.configure({ mode: 'serial' })

const ARAN = 'Cabled Aran jumper with a shawl collar'
const ARAN_FOR = 'Great-granddaughter Ella-Rose Thompson'

const shelf = (): ReturnType<Page['getByRole']> => page.getByRole('dialog', { name: 'Knitting' })
const position = (): ReturnType<Page['locator']> => page.locator('.knitting-pattern-position')
const caption = (): ReturnType<Page['locator']> => page.locator('.knitting-piece-caption')
const picture = (): ReturnType<Page['locator']> => page.locator('.knitting-piece-picture img')
const pieceList = (): ReturnType<Page['getByRole']> =>
  admin.getByRole('list', { name: 'Finished pieces' })

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

async function openGallery(): Promise<void> {
  await openShelf()
  await shelf().locator('[data-knitting-card="gallery"]').click()
  await expect(page.getByRole('heading', { name: 'My knitting' })).toBeVisible()
}

async function shownWidth(): Promise<number> {
  await expect
    .poll(() => picture().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
  return picture().evaluate((img: HTMLImageElement) => img.naturalWidth)
}

/** Photos differ in width, so which piece is showing is visible in the decoded picture. */
async function writePhoto(name: string, width: number): Promise<string> {
  const data = await page.evaluate((width) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = 500
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#5b7fb8'
    ctx.fillRect(0, 0, width, 500)
    ctx.fillStyle = '#fffdf8'
    ctx.fillRect(width / 4, 100, width / 2, 300)
    return canvas.toDataURL('image/png').split(',')[1]!
  }, width)
  const path = join(root, name)
  writeFileSync(path, Buffer.from(data, 'base64'))
  return path
}

async function addPiece(what: string, forWhom: string, width: number): Promise<void> {
  const path = await writePhoto(`${width}.png`, width)
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }
  }, path)
  await admin.getByLabel('What it is').fill(what)
  await admin.getByLabel('Who it was for').fill(forWhom)
  await admin.getByRole('button', { name: 'Choose a photo…' }).click()
  await expect(
    admin.getByRole('status').filter({ hasText: 'Piece saved. She sees it first in My knitting.' })
  ).toBeVisible()
  await expect(pieceList().getByRole('listitem').first()).toContainText(what)
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-gallery-'))
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
  admin.on('dialog', (dialog) => void dialog.accept())
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.evaluate(async () => {
    const tile: Tile = {
      id: 'knitting',
      type: 'builtin',
      builtinKey: 'knitting',
      label: 'Knitting',
      size: 'normal',
      slot: 0,
      colorIndex: 1
    }
    await window.admin.setConfig({ tiles: [tile] })
  })
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('the caregiver adds finished pieces with what each is and who it was for', async () => {
  // Nothing set up yet: a calm line, and no gallery card to open.
  await openShelf()
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()

  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(admin.getByText('No finished pieces yet.')).toBeVisible()
  await addPiece('Blue cardigan', 'Ella', 700)
  await addPiece('Mittens', '', 710)
  await addPiece(ARAN, ARAN_FOR, 720)
  // Newest first.
  await expect(pieceList().getByRole('listitem')).toHaveText([
    `${ARAN} · for ${ARAN_FOR}Move earlierMove laterRemove`,
    'MittensMove earlierMove laterRemove',
    'Blue cardigan · for EllaMove earlierMove laterRemove'
  ])
  // Home is only ever given media URLs, never where the photos came from.
  const home = JSON.stringify(await page.evaluate(() => window.launcher.getKnitting()))
  // Compared as JSON: a leaked Windows path appears there with doubled backslashes.
  expect(home).not.toContain(JSON.stringify(root).slice(1, -1))
  expect(home).toMatch(/grammie-media:\/\/knitted\//)
})

test('she pages through them large, with what it is and who it went to underneath', async () => {
  await openShelf()
  await expect(shelf().locator('[data-knitting-card="gallery"]')).toHaveAccessibleName(
    'My knitting: 3 pieces'
  )
  await shelf().locator('[data-knitting-card="gallery"]').click()
  await expect(page.getByRole('button', { name: 'Back to Knitting', exact: true })).toBeFocused()
  await expect(position()).toHaveText('1 of 3')
  await expect(caption()).toHaveText(`${ARAN}For ${ARAN_FOR}`)
  expect(await shownWidth()).toBe(720)
  await expect(page.getByRole('button', { name: 'Previous piece' })).toBeDisabled()
  await page.getByRole('button', { name: 'Next piece' }).click()
  await expect(position()).toHaveText('2 of 3')
  // No recipient, no "For" line.
  await expect(caption()).toHaveText('Mittens')
  expect(await shownWidth()).toBe(710)
  await page.keyboard.press('ArrowRight')
  await expect(position()).toHaveText('3 of 3')
  await expect(caption()).toHaveText('Blue cardiganFor Ella')
  expect(await shownWidth()).toBe(700)
  await expect(page.getByRole('button', { name: 'Next piece' })).toBeDisabled()
  // Reaching the last piece from the keyboard keeps focus in the viewer, so the
  // arrow keys still turn pieces.
  await expect(page.getByRole('button', { name: 'Next piece' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(position()).toHaveText('2 of 3')
  await page.keyboard.press('ArrowRight')
  await expect(position()).toHaveText('3 of 3')
  const area = await page.locator('.knitting-piece-picture').boundingBox()
  const height = await page.evaluate(() => innerHeight)
  expect(area!.height).toBeGreaterThan(height * 0.4)
  await page.screenshot({ path: test.info().outputPath('knitting-gallery.png') })
  await page.getByRole('button', { name: 'Back to Knitting', exact: true }).click()
  await expect(shelf().locator('[data-knitting-card="gallery"]')).toBeFocused()
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
})

test('the caregiver reorders her pieces and Home follows', async () => {
  for (let move = 0; move < 2; move += 1) {
    await admin.getByRole('button', { name: 'Move Blue cardigan earlier' }).click()
    await expect(admin.getByRole('status').filter({ hasText: 'Order saved.' })).toBeVisible()
  }
  await expect(pieceList().getByRole('listitem').first()).toContainText('Blue cardigan')
  await expect(admin.getByRole('button', { name: 'Move Blue cardigan earlier' })).toBeDisabled()
  await openGallery()
  await expect(position()).toHaveText('1 of 3')
  await expect(caption()).toHaveText('Blue cardiganFor Ella')
  await page.getByRole('button', { name: 'Next piece' }).click()
  await expect(caption()).toHaveText(`${ARAN}For ${ARAN_FOR}`)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(shelf()).toHaveCount(0)
})

test('a piece whose photo is gone keeps its caption, and the others still show', async () => {
  // A photo Home has never shown: Chromium can keep one it already showed in memory.
  await addPiece('Tea cosy', 'Mum', 730)
  const knitting = await page.evaluate(() => window.launcher.getKnitting())
  unlinkSync(join(root, 'media', 'knitted', knitting.pieces[0]!.url!.split('/').at(-1)!))
  await openGallery()
  await expect(position()).toHaveText('1 of 4')
  await expect(page.getByText("This picture isn't ready right now.")).toBeVisible()
  await expect(caption()).toHaveText('Tea cosyFor Mum')
  await page.getByRole('button', { name: 'Next piece' }).click()
  await expect(caption()).toHaveText('Blue cardiganFor Ella')
  expect(await shownWidth()).toBe(700)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('the gallery fits at every text size on both screen sizes', async () => {
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
      await openGallery()
      // The longest caption: what it is and who it was for both near their 40 characters.
      await page.getByRole('button', { name: 'Next piece' }).click()
      await page.getByRole('button', { name: 'Next piece' }).click()
      await expect(caption()).toContainText(ARAN)
      const bounds = await page.evaluate(() => {
        const box = (
          el: Element
        ): { top: number; bottom: number; left: number; right: number; height: number } => {
          const { top, bottom, left, right, height } = el.getBoundingClientRect()
          return { top, bottom, left, right, height }
        }
        return {
          height: innerHeight,
          width: innerWidth,
          picture: box(document.querySelector('.knitting-piece-picture')!),
          caption: box(document.querySelector('.knitting-piece-caption')!),
          controls: [...document.querySelectorAll('.knitting-shelf button')].map(box)
        }
      })
      expect(bounds.picture.height).toBeGreaterThan(200)
      expect(bounds.caption.bottom).toBeLessThanOrEqual(bounds.height)
      expect(bounds.caption.right).toBeLessThanOrEqual(bounds.width)
      for (const control of bounds.controls) {
        expect(control.height).toBeGreaterThanOrEqual(76)
        expect(control.top).toBeGreaterThanOrEqual(0)
        expect(control.bottom).toBeLessThanOrEqual(bounds.height)
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(bounds.width)
      }
      if (fontStep === 4) {
        await page.screenshot({
          path: test.info().outputPath(`knitting-gallery-${size.width}-large-text.png`)
        })
      }
      await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
      await expect(shelf()).toHaveCount(0)
    }
  }
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({ display: { ...config.display, fontStep: 0 } })
  })
})

test('removing every piece takes her back to the shelf, and nothing personal is logged', async () => {
  await openGallery()
  for (const what of ['Tea cosy', 'Blue cardigan', ARAN, 'Mittens']) {
    await admin.getByRole('button', { name: `Remove piece ${what}` }).click()
    await expect(admin.getByRole('status').filter({ hasText: 'Piece removed.' })).toBeVisible()
  }
  await expect(admin.getByText('No finished pieces yet.')).toBeVisible()
  // Home went back to the shelf by itself, which says calmly that nothing is set up.
  await expect(page.getByRole('heading', { name: 'My knitting' })).toHaveCount(0)
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
  const log = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog(1000)))
  for (const detail of ['cardigan', 'Ella', 'Mittens', 'Aran', 'Tea cosy', 'Mum', root]) {
    expect(log).not.toContain(JSON.stringify(detail).slice(1, -1))
  }
  expect(errors).toEqual([])
})
