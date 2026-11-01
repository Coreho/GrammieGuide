import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

// A line break in an article used to empty Home completely, Home button included.
let app: ElectronApplication
let page: Page
let root: string
let server: Server
test.describe.configure({ mode: 'serial' })

const WORDS =
  'A long paragraph of ordinary words about knitting and yarn and needles, with commas, so the page reads as an article. '.repeat(
    6
  )
const ARTICLE = `<!doctype html><title>Handspun evolution</title><article><h1>Handspun evolution</h1>
<p>${WORDS}</p><p>First line<br>Second line ${WORDS}</p><p>${WORDS}</p><p>${WORDS}</p></article>`

const homeButton = (): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: '🏠 Home', exact: true }).first()

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-reader-'))
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(ARTICLE)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const config = defaultConfig()
  config.display.homeLayout = 'simple4'
  config.buddy.motion = 'still'
  config.tiles = [
    {
      id: 'web',
      label: 'Local page',
      type: 'web',
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
      size: 'normal',
      slot: 0,
      colorIndex: 0
    }
  ]
  writeFileSync(join(root, 'grammieguide-config.json'), JSON.stringify(config))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: 'Local page', exact: true }).click()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    server?.close()
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('an article with a line break opens, and keeps the line break and the Home button', async () => {
  await page.getByRole('button', { name: 'Show article', exact: true }).click()
  const article = page.getByRole('region', { name: 'News article' })
  await expect(article.getByRole('heading', { name: 'Handspun evolution' })).toBeVisible()
  await expect(article.locator('.reader-body br')).toHaveCount(1)
  await expect(article.getByText('First line')).toBeVisible()
  await expect(homeButton()).toBeVisible()
  await page.getByRole('button', { name: 'Show page', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show article', exact: true })).toBeVisible()
})

test('an article that can not be drawn returns her to the page, not a blank screen', async () => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ BrowserWindow }) => {
    const home = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('/launcher/index.html')
    )!
    home.webContents.send('browser:reader', {
      mode: 'article',
      available: true,
      headline: '',
      article: { title: 'Broken', byline: '', date: '', nodes: [null], plainText: '' }
    })
  })
  await expect(page.getByRole('button', { name: 'Show article', exact: true })).toBeVisible()
  await expect(homeButton()).toBeVisible()
  await expect(page.getByRole('region', { name: 'News article' })).toHaveCount(0)
  expect(await page.evaluate(() => document.getElementById('root')?.childElementCount)).toBe(1)
})
