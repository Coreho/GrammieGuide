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

const shelf = (): ReturnType<Page['getByRole']> => page.getByRole('dialog', { name: 'Knitting' })
const position = (): ReturnType<Page['locator']> => page.locator('.knitting-pattern-position')
const pageImage = (): ReturnType<Page['locator']> => page.locator('.knitting-pattern-page img')

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

async function shownWidth(): Promise<number> {
  await expect
    .poll(() =>
      pageImage().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
    )
    .toBe(true)
  return pageImage().evaluate((img: HTMLImageElement) => img.naturalWidth)
}

/** Pages differ in width, so the order she sees them in is visible in the decoded pictures. */
async function writePages(names: Record<string, number>): Promise<string[]> {
  const paths: string[] = []
  for (const [name, width] of Object.entries(names)) {
    const data = await page.evaluate((width) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = 800
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fffdf8'
      ctx.fillRect(0, 0, width, 800)
      ctx.fillStyle = '#30291f'
      ctx.font = 'bold 48px sans-serif'
      ctx.fillText(`Row instructions ${width}`, 40, 120)
      return canvas.toDataURL('image/png').split(',')[1]!
    }, width)
    const path = join(root, name)
    writeFileSync(path, Buffer.from(data, 'base64'))
    paths.push(path)
  }
  return paths
}

async function pickNext(paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: paths }
    }
  }, paths)
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-patterns-'))
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

test('the caregiver saves a named pattern from page pictures and links it to her project', async () => {
  // Picked out of order on purpose; pages follow their file names.
  await pickNext(await writePages({ 'page2.png': 610, 'page10.png': 620, 'page1.png': 600 }))
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await admin.getByLabel('Pattern name').fill('Cable scarf')
  await admin.getByRole('button', { name: 'Choose page pictures…' }).click()
  await expect(
    admin.getByRole('status').filter({ hasText: 'Pattern saved with 3 pages.' })
  ).toBeVisible()
  await expect(admin.getByRole('list', { name: 'Saved patterns' })).toContainText(
    'Cable scarf · 3 pages'
  )
  await admin.getByLabel('What she is making').fill('Scarf')
  await admin.getByLabel('Pattern for this project').selectOption({ label: 'Cable scarf' })
  await admin.getByRole('button', { name: 'Save project', exact: true }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Project saved.' })).toBeVisible()
  // Home is only ever given media URLs, never where the pages came from.
  const home = JSON.stringify(await page.evaluate(() => window.launcher.getKnitting()))
  expect(home).not.toContain(root)
  expect(home).toMatch(/grammie-media:\/\/patterns\//)
})

test('she reads one page at a time, filling the screen, with large Back and Next', async () => {
  await openShelf()
  await expect(shelf().locator('[data-knitting-card="patterns"]')).toHaveAccessibleName(
    'Patterns: Cable scarf'
  )
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await expect(page.getByRole('button', { name: 'Back to Knitting', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Cable scarf' })).toBeVisible()
  await expect(position()).toHaveText('Page 1 of 3')
  expect(await shownWidth()).toBe(600)
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(position()).toHaveText('Page 2 of 3')
  expect(await shownWidth()).toBe(610)
  await page.keyboard.press('ArrowRight')
  await expect(position()).toHaveText('Page 3 of 3')
  expect(await shownWidth()).toBe(620)
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
  // Reaching the last page from the keyboard keeps focus in the viewer, so the
  // arrow keys still turn pages.
  await expect(page.getByRole('button', { name: 'Next page' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(position()).toHaveText('Page 2 of 3')
  await page.keyboard.press('ArrowRight')
  await expect(position()).toHaveText('Page 3 of 3')
  const area = await page.locator('.knitting-pattern-page').boundingBox()
  const viewport =
    page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
  expect(area!.height).toBeGreaterThan(viewport.height * 0.5)
  await page.screenshot({ path: test.info().outputPath('knitting-pattern.png') })
})

test('the pattern reopens on her page, even after Home reloads', async () => {
  await page.getByRole('button', { name: 'Back to Knitting', exact: true }).click()
  await expect(shelf().locator('[data-knitting-card="patterns"]')).toBeFocused()
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await expect(position()).toHaveText('Page 3 of 3')
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(position()).toHaveText('Page 2 of 3')
  await page.reload()
  await openShelf()
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await expect(position()).toHaveText('Page 2 of 3')
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(shelf()).toHaveCount(0)
})

test('she opens the linked pattern from her project and comes back to her count', async () => {
  await openShelf()
  await shelf().locator('[data-knitting-card="project"]').click()
  await page.getByRole('button', { name: '📄 Pattern' }).click()
  await expect(page.getByRole('button', { name: 'Back to my project', exact: true })).toBeFocused()
  await expect(position()).toHaveText('Page 2 of 3')
  await page.keyboard.press('Escape')
  await expect(page.locator('.knitting-project-rows-count')).toHaveText('0')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(shelf()).toHaveCount(0)
})

test('with two patterns she chooses from a list, and Back returns to it', async () => {
  await pickNext(await writePages({ 'hat-1.png': 640, 'hat-2.png': 650 }))
  await admin.getByLabel('Pattern name').fill('Bobble hat')
  await admin.getByRole('button', { name: 'Choose page pictures…' }).click()
  await expect(
    admin.getByRole('status').filter({ hasText: 'Pattern saved with 2 pages.' })
  ).toBeVisible()
  await openShelf()
  await expect(shelf().locator('[data-knitting-card="patterns"]')).toHaveAccessibleName(
    'Patterns: 2 patterns'
  )
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await expect(page.getByRole('heading', { name: 'Patterns' })).toBeVisible()
  await page.getByRole('button', { name: 'Bobble hat, 2 pages' }).click()
  await expect(page.getByRole('button', { name: 'Back to patterns', exact: true })).toBeFocused()
  await expect(position()).toHaveText('Page 1 of 2')
  expect(await shownWidth()).toBe(640)
  await page.getByRole('button', { name: 'Back to patterns', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Bobble hat, 2 pages' })).toBeFocused()
  await page.getByRole('button', { name: 'Back to Knitting', exact: true }).click()
  await expect(shelf().locator('[data-knitting-card="patterns"]')).toBeFocused()
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
})

test('a page whose picture is gone shows a calm line, and the others still work', async () => {
  // Remove a page Home has never shown: Chromium can keep a picture it already
  // showed in memory, even across a reload, which made this test pass or fail by chance.
  const knitting = await page.evaluate(() => window.launcher.getKnitting())
  const hat = knitting.patterns.find((pattern) => pattern.name === 'Bobble hat')!
  unlinkSync(join(root, 'media', 'patterns', hat.pages[1]!.url!.split('/').at(-1)!))
  await openShelf()
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await page.getByRole('button', { name: 'Bobble hat, 2 pages' }).click()
  await expect(position()).toHaveText('Page 1 of 2')
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(position()).toHaveText('Page 2 of 2')
  await expect(page.getByText("This page isn't ready right now.")).toBeVisible()
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(position()).toHaveText('Page 1 of 2')
  expect(await shownWidth()).toBe(640)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('the viewer fits at every text size on both screen sizes', async () => {
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
      await openShelf()
      await shelf().locator('[data-knitting-card="patterns"]').click()
      await page.getByRole('button', { name: 'Cable scarf, 3 pages' }).click()
      await expect(position()).toBeVisible()
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
          page: box(document.querySelector('.knitting-pattern-page')!),
          controls: [...document.querySelectorAll('.knitting-shelf button')].map(box)
        }
      })
      expect(bounds.page.height).toBeGreaterThan(200)
      for (const control of bounds.controls) {
        expect(control.height).toBeGreaterThanOrEqual(76)
        expect(control.top).toBeGreaterThanOrEqual(0)
        expect(control.bottom).toBeLessThanOrEqual(bounds.height)
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(bounds.width)
      }
      if (fontStep === 4) {
        await page.screenshot({
          path: test.info().outputPath(`knitting-pattern-${size.width}-large-text.png`)
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

test('removing patterns updates Home live and unlinks her project', async () => {
  for (const name of ['Bobble hat', 'Cable scarf']) {
    await admin.getByRole('button', { name: `Remove pattern ${name}` }).click()
    await expect(admin.getByRole('status').filter({ hasText: 'Pattern removed.' })).toBeVisible()
  }
  await expect(admin.getByText('No patterns yet.')).toBeVisible()
  await openShelf()
  await expect(shelf().locator('[data-knitting-card="patterns"]')).toHaveCount(0)
  await shelf().locator('[data-knitting-card="project"]').click()
  await expect(page.getByRole('button', { name: '📄 Pattern' })).toHaveCount(0)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  const log = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog(1000)))
  for (const detail of ['Cable', 'Bobble', 'page1', root]) expect(log).not.toContain(detail)
  expect(errors).toEqual([])
})
