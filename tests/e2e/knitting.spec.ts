import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
const errors: string[] = []
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
  admin.on('dialog', (dialog) => void dialog.accept())
  await admin.waitForLoadState('domcontentloaded')
}

async function unlock(): Promise<void> {
  await admin.getByPlaceholder('Enter PIN', { exact: true }).fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
}

const shelf = (): ReturnType<Page['getByRole']> => page.getByRole('dialog', { name: 'Knitting' })
const card = (): ReturnType<Page['locator']> => shelf().locator('[data-knitting-card="project"]')
const rows = (): ReturnType<Page['locator']> => page.locator('.knitting-project-rows-count')

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-'))
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 400
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c96f8f'
    ctx.fillRect(0, 0, 600, 400)
    ctx.fillStyle = '#f2d7a6'
    ctx.beginPath()
    ctx.arc(300, 200, 120, 0, Math.PI * 2)
    ctx.fill()
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const source = join(root, 'scarf.png')
  writeFileSync(source, Buffer.from(image, 'base64'))
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }
  }, source)
  await admin.evaluate(() => window.admin.importPhotos())
})

test.afterAll(async () => {
  await app?.close()
})

test('the Knitting tile opens a calm shelf until her project is set up', async () => {
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('knitting')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await openShelf()
  await expect(shelf().getByRole('button', { name: 'Back to Home', exact: true })).toBeFocused()
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await expect(card()).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(shelf()).toHaveCount(0)
})

test('the caregiver sets up her project with a photo, and the shelf shows it with her row', async () => {
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await admin.getByLabel('What she is making').fill('Scarf')
  await admin.getByLabel('Who it is for').fill('Tom')
  await admin
    .getByRole('group', { name: 'Choose a tile photo' })
    .getByRole('button')
    .first()
    .click()
  await admin.getByRole('button', { name: 'Save project', exact: true }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Project saved.' })).toBeVisible()
  await openShelf()
  await expect(card()).toHaveAccessibleName('My project: Scarf, row 0')
  await expect(card()).toContainText('Scarf · Row 0')
  await expect
    .poll(() =>
      card()
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
    )
    .toBe(true)
  await expect(page.getByText(/^Opening Knitting/)).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('knitting-shelf.png') })
})

test('she counts rows; a quick double tap counts once, and Home has no way to reset', async () => {
  await card().click()
  await expect(page.getByRole('button', { name: 'Back to Knitting', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Scarf' })).toBeVisible()
  await expect(page.getByText('For Tom', { exact: true })).toBeVisible()
  await expect(rows()).toHaveText('0')
  await expect(page.getByRole('button', { name: '− Take one away' })).toBeDisabled()
  await page.getByRole('button', { name: '+ Add a row' }).dblclick()
  await expect(rows()).toHaveText('1')
  await page.waitForTimeout(500)
  await expect(rows()).toHaveText('1')
  // The guard only holds back the same tap; after it, the next row counts.
  await page.waitForTimeout(1600)
  await page.getByRole('button', { name: '+ Add a row' }).click()
  await expect(rows()).toHaveText('2')
  await page.getByRole('button', { name: '− Take one away' }).click()
  await expect(rows()).toHaveText('1')
  await expect(page.getByRole('button', { name: /reset|new project|remove/i })).toHaveCount(0)
  await expect(admin.getByText('She is on row 1 of Scarf.')).toBeVisible()
  await page.getByRole('button', { name: 'Back to Knitting', exact: true }).click()
  await expect(card()).toBeFocused()
  await expect(card()).toContainText('Scarf · Row 1')
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
})

test('her row survives a reload of Home and a restart of the app', async () => {
  await page.reload()
  await openShelf()
  await expect(card()).toContainText('Scarf · Row 1')
  await page.keyboard.press('Escape')
  await app.close()
  await launch()
  await unlock()
  await openShelf()
  await expect(card()).toContainText('Scarf · Row 1')
  await page.keyboard.press('Escape')
})

test('only the caregiver resets the count or starts a new project, and Home follows live', async () => {
  await openShelf()
  await card().click()
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await admin.getByRole('button', { name: 'Reset row count to 0', exact: true }).click()
  await expect(rows()).toHaveText('0')
  await admin.getByLabel('What she is making').fill('Hat')
  await admin.getByLabel('Who it is for').fill('')
  await admin.getByRole('button', { name: 'Save as a new project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hat' })).toBeVisible()
  await expect(page.getByText(/^For /)).toHaveCount(0)
  await page.getByRole('button', { name: '+ Add a row' }).click()
  await expect(rows()).toHaveText('1')
  await page.keyboard.press('Escape')
  await expect(card()).toContainText('Hat · Row 1')
  await page.keyboard.press('Escape')
})

test('the counter fits at every text size on both screen sizes', async () => {
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
      await card().click()
      await expect(rows()).toBeVisible()
      const bounds = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('.knitting-shelf button')].map((button) =>
          button.getBoundingClientRect()
        )
        const count = document
          .querySelector('.knitting-project-rows-count')!
          .getBoundingClientRect()
        return {
          height: innerHeight,
          width: innerWidth,
          count: { top: count.top, bottom: count.bottom },
          controls: controls.map(({ top, bottom, left, right, height }) => ({
            top,
            bottom,
            left,
            right,
            height
          }))
        }
      })
      expect(bounds.count.top).toBeGreaterThanOrEqual(0)
      expect(bounds.count.bottom).toBeLessThanOrEqual(bounds.height)
      for (const control of bounds.controls) {
        expect(control.height).toBeGreaterThanOrEqual(76)
        expect(control.top).toBeGreaterThanOrEqual(0)
        expect(control.bottom).toBeLessThanOrEqual(bounds.height)
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(bounds.width)
      }
      if (fontStep === 4) {
        await page.screenshot({
          path: test.info().outputPath(`knitting-${size.width}-large-text.png`)
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

test('with idle dimming on, her first tap after a long row still counts', async () => {
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({
      display: { ...config.display, idleDim: { enabled: true, afterMinutes: 2, level: 0.4 } }
    })
  })
  await openShelf()
  await card().click()
  const before = Number(await rows().textContent())
  const veil = page.locator('[data-idle-dimmed]')
  // Minutes of knitting without waiting minutes: Playwright's clock drives Home's timers.
  await page.clock.install()
  await page.clock.fastForward('03:00')
  await expect(veil).toHaveAttribute('data-idle-dimmed', 'true')
  await page.getByRole('button', { name: '+ Add a row' }).click()
  await expect(veil).toHaveAttribute('data-idle-dimmed', 'false')
  await expect(rows()).toHaveText(String(before + 1))
  await page.clock.resume()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(shelf()).toHaveCount(0)
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({
      display: { ...config.display, idleDim: { ...config.display.idleDim, enabled: false } }
    })
  })
})

test('removing her project returns Home to the calm shelf, and logs never name it', async () => {
  await openShelf()
  await card().click()
  await admin.getByRole('button', { name: 'Remove project', exact: true }).click()
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await expect(card()).toHaveCount(0)
  const log = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog(1000)))
  for (const detail of ['Scarf', 'Hat', 'Tom']) expect(log).not.toContain(detail)
  expect(log).toContain('knitting-row-added')
  expect(log).toContain('knitting-project-removed')
  expect(errors).toEqual([])
})
