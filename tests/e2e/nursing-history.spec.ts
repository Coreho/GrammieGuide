import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'
import type { NursingFile } from '../../src/shared/nursing/nursingHistory'

const folders: string[] = []
const apps: ElectronApplication[] = []

test.afterAll(async () => {
  for (const app of apps) await app.close().catch(() => undefined)
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 3 })
})

/** A fresh userData with one Nursing History tile; `history` is written only when given. */
async function launch(
  setUp?: (userData: string, app: ElectronApplication) => Promise<void>
): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const userData = mkdtempSync(join(tmpdir(), 'grammieguide-nursing-'))
  folders.push(userData)
  const config = defaultConfig()
  config.buddy.motion = 'reduced'
  config.tiles = [
    {
      id: 'nursing',
      type: 'builtin',
      builtinKey: 'nursing',
      label: 'Nursing History',
      size: 'normal',
      colorIndex: 0,
      slot: 0
    }
  ]
  writeFileSync(join(userData, 'grammieguide-config.json'), JSON.stringify(config))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  apps.push(app)
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await setUp?.(userData, app)
  return { app, page, errors }
}

test('an empty history shows a calm line', async () => {
  const { page, errors } = await launch()
  await page.getByRole('button', { name: 'Nursing History', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nursing History' })
  await expect(dialog.getByRole('status')).toHaveText(
    'Your nursing history will be here once your family adds it.'
  )
  await dialog.getByRole('button', { name: 'Back to Home' }).click()
  await expect(dialog).toHaveCount(0)
  expect(errors).toEqual([])
})

test('she opens a chapter, reads its story, pages through a paper and finds her way back', async () => {
  const pageIds = [randomUUID(), randomUUID(), randomUUID()]
  const { page, errors } = await launch(async (userData, app) => {
    const media = join(userData, 'media', 'nursing')
    mkdirSync(media, { recursive: true })
    // Plain colored squares stand in for page pictures; never production content.
    const jpegs = await app.evaluate(({ nativeImage }) =>
      [40, 160].map((shade) => {
        const pixels = Buffer.alloc(32 * 32 * 4, shade)
        return nativeImage
          .createFromBitmap(pixels, { width: 32, height: 32 })
          .toJPEG(85)
          .toString('base64')
      })
    )
    // The middle page's picture is missing on purpose.
    const entries = [0, 2].map((at, index) => {
      writeFileSync(join(media, `${pageIds[at]}.jpg`), Buffer.from(jpegs[index]!, 'base64'))
      return { id: pageIds[at]!, fileName: `${pageIds[at]}.jpg`, metadata: {} }
    })
    writeFileSync(join(media, 'index.json'), JSON.stringify({ entries }))
    const history: NursingFile = {
      version: 1,
      chapters: [
        {
          id: randomUUID(),
          title: 'Nursing school',
          years: '1960s',
          story: 'A made-up story for this test.',
          papers: [{ id: randomUUID(), title: 'Test paper', note: 'Her own paper', pages: pageIds }]
        },
        { id: randomUUID(), title: 'Teaching', years: '2008 - 2012', story: '', papers: [] }
      ]
    }
    mkdirSync(join(userData, 'nursing'), { recursive: true })
    writeFileSync(join(userData, 'nursing', 'history.json'), JSON.stringify(history))
  })

  await page.getByRole('button', { name: 'Nursing History', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nursing History' })
  const chapters = dialog.getByRole('list', { name: 'Chapters of your nursing career' })
  await expect(chapters.getByRole('button')).toHaveText([
    /Nursing school\s*1960s/,
    /Teaching\s*2008 - 2012/
  ])

  await chapters.getByRole('button', { name: /Nursing school/ }).click()
  await expect(dialog.getByRole('heading', { level: 1 })).toHaveText('Nursing school')
  await expect(dialog.getByText('A made-up story for this test.')).toBeVisible()
  await dialog.getByRole('button', { name: /Test paper/ }).click()
  await expect(dialog.getByRole('button', { name: /Test paper/ })).toHaveCount(0)

  const picture = dialog.locator('.knitting-pattern-page img')
  await expect(picture).toHaveAttribute('src', `grammie-media://nursing/${pageIds[0]}.jpg`)
  await expect(dialog.getByText('Page 1 of 3')).toBeVisible()
  await dialog.getByRole('button', { name: 'Next page' }).click()
  // The missing page says so calmly, and the buttons keep working around it.
  await expect(dialog.getByRole('status')).toHaveText("This page isn't ready right now.")
  await expect(dialog.getByText('Page 2 of 3')).toBeVisible()
  await dialog.getByRole('button', { name: 'Next page' }).click()
  await expect(picture).toHaveAttribute('src', `grammie-media://nursing/${pageIds[2]}.jpg`)
  await expect
    .poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBeGreaterThan(0)
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByText('Page 2 of 3')).toBeVisible()

  await dialog.getByRole('button', { name: 'Back to this chapter' }).click()
  await expect(dialog.getByRole('heading', { level: 1 })).toHaveText('Nursing school')
  await dialog.getByRole('button', { name: 'Back to the chapters' }).click()
  await chapters.getByRole('button', { name: /Teaching/ }).click()
  // A chapter with no story or papers yet is just its title, with the way back.
  await expect(dialog.getByRole('heading', { level: 1 })).toHaveText('Teaching')
  await dialog.getByRole('button', { name: '🏠 Home' }).click()
  await expect(dialog).toHaveCount(0)
  expect(errors).toEqual([])
})
