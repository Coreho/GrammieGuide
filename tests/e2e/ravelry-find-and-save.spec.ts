import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

// Stands in for Ravelry in main's fetch and serves a real, tiny PDF, so the hidden PDF window
// really runs. No test reaches the real site.
const READ_NAME = 'read-e2e-username'
const READ_KEY = 'e2e-sekret-password'
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PICTURE = 'https://93.184.216.34/photo'
const PDF_URL = 'https://93.184.216.34/pattern.pdf'

/** A valid two-page PDF, written out by hand so the repo holds nobody's real pattern. */
function twoPagePdf(): string {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R /Resources << >> >>',
    '<< /Length 30 >>\nstream\n0.2 0.5 0.8 rg 40 40 200 200 re f\nendstream'
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return body
}

const item = (id: number, name: string): Record<string, unknown> => ({
  id,
  name,
  pattern_author: { name: 'Ann Example' },
  first_photo: { medium_url: `${PICTURE}-${id}.jpg`, small_url: `${PICTURE}-${id}-s.jpg` }
})
const full = (id: number, name: string, instructions: string | null): Record<string, unknown> => ({
  pattern: {
    id,
    name,
    permalink: name.toLowerCase().replace(/ /g, '-'),
    free: instructions !== null,
    pattern_author: { name: 'Ann Example' },
    notes_html: `<p>All about ${name}.</p>`,
    yarn_weight_description: 'DK',
    photos: [{ medium2_url: `${PICTURE}-${id}-a.jpg` }, { medium2_url: `${PICTURE}-${id}-b.jpg` }],
    download_location: instructions ? { url: instructions } : null
  }
})

let app: ElectronApplication
let page: Page
let root: string
let site: Server
let siteOrigin: string
test.describe.configure({ mode: 'serial' })

async function standIn(mode: 'ok' | 'down'): Promise<void> {
  await app.evaluate(
    (_electron, { mode, png, pdf, patterns, pages }) => {
      const stand = globalThis as unknown as { __calls: string[] }
      stand.__calls = []
      globalThis.fetch = async (input) => {
        const url = new URL(String(input))
        stand.__calls.push(url.pathname + url.search)
        if (mode === 'down') throw new TypeError('fetch failed')
        if (url.host === 'api.ravelry.com') {
          const body =
            url.pathname === '/patterns/search.json'
              ? {
                  patterns:
                    url.searchParams.get('page') === '2'
                      ? pages.second
                      : url.searchParams.get('pc') === 'blanket'
                        ? pages.first
                        : pages.first.slice(0, 1),
                  paginator: { last_page: 2 }
                }
              : patterns[url.pathname.replace('/patterns/', '').replace('.json', '')]
          if (!body) return new Response('{}', { status: 404 })
          return new Response(JSON.stringify(body), {
            headers: { 'content-type': 'application/json' }
          })
        }
        if (url.pathname === '/pattern.pdf') {
          return new Response(Buffer.from(pdf, 'latin1'), {
            headers: { 'content-type': 'application/pdf' }
          })
        }
        return new Response(Buffer.from(png, 'base64'), {
          headers: { 'content-type': 'image/png' }
        })
      }
    },
    {
      mode,
      png: PNG,
      pdf: twoPagePdf(),
      patterns: {
        '101': full(101, 'Cosy Blanket', PDF_URL),
        '102': full(102, 'Plain Blanket', null),
        '104': full(104, 'Second Page Blanket', null),
        'paid-shawl': full(103, 'Paid Shawl', null)
      },
      pages: {
        first: [item(101, 'Cosy Blanket'), item(102, 'Plain Blanket')],
        second: [item(104, 'Second Page Blanket')]
      }
    }
  )
}

async function launch(mode: 'ok' | 'down'): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await standIn(mode)
}

const shelf = (): Locator => page.getByRole('dialog', { name: 'Knitting' })
const ravelryCard = (): Locator => shelf().locator('[data-knitting-card="ravelry"]')
const saveButton = (): Locator => shelf().locator('[data-ravelry-save]')
const pageSave = (): Locator => page.locator('[data-ravelry-page-save]')

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

async function saveKeyThroughAdmin(): Promise<void> {
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  const admin = await opened
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await admin.getByLabel('Username').fill(READ_NAME)
  await admin.getByLabel('Password').fill(READ_KEY)
  await admin.getByRole('button', { name: 'Save key', exact: true }).click()
  await expect(admin.getByText('The read-only key is saved.')).toBeVisible()
  await admin.close()
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-find-'))
  site = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end('<!doctype html><title>Stand-in</title><p>A page</p>')
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  siteOrigin = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`
  const config = defaultConfig()
  config.display.homeLayout = 'simple4'
  config.buddy.motion = 'still'
  config.tiles = [
    {
      id: 'knit',
      label: 'Knitting',
      type: 'builtin',
      builtinKey: 'knitting',
      size: 'normal',
      slot: 0,
      colorIndex: 0
    },
    {
      id: 'pattern-page',
      label: 'Ravelry pattern',
      type: 'web',
      url: 'https://www.ravelry.com/patterns/library/paid-shawl',
      size: 'normal',
      slot: 2,
      colorIndex: 2
    },
    {
      id: 'web',
      label: 'Local page',
      type: 'web',
      url: siteOrigin,
      size: 'normal',
      slot: 1,
      colorIndex: 1
    }
  ]
  writeFileSync(join(root, 'grammieguide-config.json'), JSON.stringify(config))
  await launch('ok')
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    site?.close()
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('with no key she is not offered Find a pattern, and nothing is sent to Ravelry', async () => {
  await openShelf()
  await expect(ravelryCard()).toHaveCount(0)
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await shelf().getByRole('button', { name: 'Back to Home', exact: true }).click()
  expect(await page.evaluate(() => window.launcher.ravelryBrowse('blankets', 1))).toEqual({
    ok: false
  })
})

test('she finds a pattern through pictures and pages, without typing anything', async () => {
  await saveKeyThroughAdmin()
  await openShelf()
  await ravelryCard().click()

  await expect(shelf().getByRole('heading', { name: 'Find a pattern' })).toBeVisible()
  await expect(shelf().locator('[data-ravelry-category]')).toHaveCount(8)
  await expect(shelf().locator('input, textarea')).toHaveCount(0)
  await expect
    .poll(() =>
      shelf()
        .locator('[data-ravelry-category="blankets"] img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0)
  const calls = await app.evaluate(() => (globalThis as unknown as { __calls: string[] }).__calls)
  const search = calls.find((call) => call.includes('pc=blanket'))!
  expect(search).toContain('availability=free')
  expect(search).toContain('craft=knitting')
  expect(search).toContain('sort=popularity')

  await shelf().locator('[data-ravelry-category="blankets"]').click()
  await expect(shelf().getByRole('heading', { name: 'Blankets' })).toBeVisible()
  await expect(shelf().getByText('Page 1', { exact: true })).toBeVisible()
  await expect(shelf().locator('[data-ravelry-find]')).toHaveCount(2)

  await shelf().getByRole('button', { name: 'Next page' }).click()
  await expect(shelf().getByText('Page 2', { exact: true })).toBeVisible()
  await expect(shelf().getByText('Second Page Blanket')).toBeVisible()
  await shelf().getByRole('button', { name: 'Previous page' }).click()
  await expect(shelf().getByText('Cosy Blanket')).toBeVisible()
})

test('she looks a pattern over, saves it once, and its instructions come too', async () => {
  await shelf().locator('[data-ravelry-find="101"]').click()
  await expect(shelf().getByRole('heading', { name: 'Cosy Blanket' })).toBeVisible()
  await expect(shelf().getByText('All about Cosy Blanket.')).toBeVisible()
  await expect(shelf().getByRole('img', { name: 'Cosy Blanket' })).toHaveAttribute(
    'src',
    /^data:image\//
  )

  // Focus starts on the Back button above, and the arrow keys still turn the pictures from there.
  await expect(shelf().getByRole('button', { name: 'Back to Blankets' })).toBeFocused()
  await expect(shelf().getByText('1 of 2', { exact: true })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(shelf().getByText('2 of 2', { exact: true })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(shelf().getByText('1 of 2', { exact: true })).toBeVisible()

  await saveButton().click()
  await expect(shelf().getByText(/My saved patterns, with its instructions/)).toBeVisible({
    timeout: 30_000
  })
  await expect(saveButton()).toHaveText('✓ Saved')
  await expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
})

test('a pattern with no instructions to fetch still saves, and says who can add them', async () => {
  await page.keyboard.press('Escape')
  await shelf().locator('[data-ravelry-find="102"]').click()
  await saveButton().click()
  await expect(shelf().getByText(/Your family can add the instructions/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(shelf().locator('[data-ravelry-find="101"]')).toContainText('✓ Saved')
})

test('Home can only look at and save patterns it was served', async () => {
  expect(await page.evaluate(() => window.launcher.ravelryPattern(999))).toEqual({ ok: false })
  expect(await page.evaluate(() => window.launcher.saveRavelry(999))).toEqual({
    ok: false,
    reason: 'unavailable'
  })
  expect(await page.evaluate(() => window.launcher.ravelryBrowse('anything', 1))).toEqual({
    ok: false
  })
})

test('she reads the saved instructions offline, and they reopen on her page', async () => {
  await app.close()
  await launch('down')
  await openShelf()
  await ravelryCard().click()
  await shelf().locator('[data-ravelry-card="saved"]').click()
  await shelf().getByRole('button', { name: 'Cosy Blanket, by Ann Example' }).click()
  await expect(shelf().getByText('All about Cosy Blanket.')).toBeVisible()
  await shelf().locator('[data-ravelry-read]').click()

  await expect(shelf().getByText('Page 1 of 2')).toBeVisible()
  const pageImage = shelf().getByRole('img', { name: /Cosy Blanket, page/ })
  await expect(pageImage).toHaveAttribute('src', /^grammie-media:\/\/ravelry\//)
  await expect
    .poll(() => pageImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(1000)
  await shelf().getByRole('button', { name: 'Next page' }).click()
  await expect(shelf().getByText('Page 2 of 2')).toBeVisible()

  await shelf().getByRole('button', { name: 'Back to this pattern' }).click()
  await shelf().locator('[data-ravelry-read]').click()
  await expect(shelf().getByText('Page 2 of 2')).toBeVisible()
  expect(
    await app.evaluate(() => (globalThis as unknown as { __calls: string[] }).__calls)
  ).toEqual([])
})

test('offline, Find a pattern says so calmly, and Try again works once it is back', async () => {
  await shelf().getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openShelf()
  await ravelryCard().click()
  await shelf().locator('[data-ravelry-card="find"]').click()
  await expect(shelf().getByText("Patterns can't be found right now.")).toBeVisible()
  await standIn('ok')
  await shelf().getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(shelf().locator('[data-ravelry-category]')).toHaveCount(8)
})

test('a Save button appears only on Ravelry pattern pages, and saves that page', async () => {
  // Her browser's session answers for https, so no test reaches the real site.
  await app.evaluate(({ session }) => {
    session.fromPartition('persist:web').protocol.handle(
      'https',
      () =>
        new Response('<!doctype html><title>Pattern</title><p>Paid Shawl</p>', {
          headers: { 'content-type': 'text/html' }
        })
    )
  })
  await shelf().getByRole('button', { name: '🏠 Home', exact: true }).click()

  await page.getByRole('button', { name: 'Local page', exact: true }).click()
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true }).first()).toBeVisible()
  await expect(pageSave()).toHaveCount(0)
  expect(await page.evaluate(() => window.launcher.saveRavelryPage())).toEqual({
    ok: false,
    reason: 'unavailable'
  })
  await page.getByRole('button', { name: '🏠 Home', exact: true }).first().click()

  await page.getByRole('button', { name: 'Ravelry pattern', exact: true }).click()
  await expect(pageSave()).toHaveText('Save this pattern')
  await pageSave().click()
  await expect(pageSave()).toHaveText('✓ Saved')
  await expect(pageSave()).toBeDisabled()
  await expect(page.getByText('Saved. Your family can add the instructions.')).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).first().click()

  // Coming back to the same page, it already knows.
  await page.getByRole('button', { name: 'Ravelry pattern', exact: true }).click()
  await expect(pageSave()).toHaveText('✓ Saved')
  await page.getByRole('button', { name: '🏠 Home', exact: true }).first().click()

  await openShelf()
  await ravelryCard().click()
  await shelf().locator('[data-ravelry-card="saved"]').click()
  await expect(shelf().getByRole('button', { name: 'Paid Shawl, by Ann Example' })).toBeVisible()
  await shelf().getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('a full shelf gets a calm line, and what she has stays', async () => {
  const media = join(root, 'media', 'ravelry')
  expect(existsSync(media)).toBe(true)
  const before = readdirSync(media).length
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('knitting:saveRavelry')
    ipcMain.handle('knitting:saveRavelry', () => ({ ok: false, reason: 'full' }))
  })
  await openShelf()
  await ravelryCard().click()
  await shelf().locator('[data-ravelry-card="find"]').click()
  await shelf().locator('[data-ravelry-category="blankets"]').click()
  await shelf().getByRole('button', { name: 'Next page' }).click()
  await shelf().locator('[data-ravelry-find="104"]').click()
  await saveButton().click()
  await expect(
    shelf().getByText('Your pattern shelf is full. Your family can make room.')
  ).toBeVisible()
  await expect(saveButton()).toHaveText('Save this pattern')
  expect(readdirSync(media).length).toBe(before)
})
