import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let app: ElectronApplication
let page: Page
let admin: Page
let server: Server
let site: string

test.describe.configure({ mode: 'serial' })

function feed(base: string): string {
  const hourAgo = new Date(Date.now() - 60 * 60_000).toUTCString()
  return `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Local Times</title>
  <item>
    <title>Library opens a reading garden</title>
    <link>${base}/story-garden</link>
    <pubDate>${hourAgo}</pubDate>
    <description><![CDATA[<p>Benches, roses and <b>large-print</b> books.</p>]]></description>
  </item>
  <item>
    <title>Bakery wins the pie contest</title>
    <link>${base}/story-pie</link>
  </item>
</channel></rss>`
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/feed.xml') {
      res.setHeader('Content-Type', 'application/rss+xml')
      res.end(feed(site))
    } else if (req.url === '/broken.xml') {
      res.statusCode = 500
      res.end()
    } else if (req.url === '/story-garden') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><title>Library opens a reading garden</title>
        <meta name="author" content="Local Times staff"><meta property="article:published_time" content="2026-10-01T12:00:00Z">
        <article><h1>Library opens a reading garden</h1>
        ${Array.from({ length: 8 }, (_, i) => `<p>The reading garden has roses and comfortable benches for everyone. Families can bring a book and enjoy the flowers together. The library staff planted the garden with help from their neighbors, and the paths are open every afternoon. This is paragraph ${i + 1}. <a href="https://example.com">More about gardens</a></p>`).join('')}
        <h2>A place to rest</h2><blockquote>There is room for everyone here.</blockquote></article>`)
    } else {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<!doctype html><title>Local Times</title><h1>${req.url}</h1>`)
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-news-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
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
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

async function browserUrls(): Promise<string[]> {
  return app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()))
}

test('caregiver adds a wide News tile; she previews stories and opens one', async () => {
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('news')
  await expect(admin.getByLabel('Tile label')).toHaveValue('News')
  await expect(admin.getByLabel('Tile size')).toHaveValue('wide')
  await admin.getByLabel('News layout').selectOption('feed')
  await expect(admin.getByLabel('Feed address')).toHaveValue('https://feeds.npr.org/1001/rss.xml')
  await admin.getByLabel('Feed address').fill('not a web address')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(admin.getByText('Enter a complete http:// or https:// feed address.')).toBeVisible()
  await admin.getByLabel('Feed address').fill(`${site}/feed.xml`)
  await admin.getByLabel('News website').fill(site)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  const tile = page.getByRole('button', { name: 'News', exact: true })
  await expect(tile).toHaveCSS('grid-column-start', '1')
  await expect(tile).toHaveCSS('grid-column-end', 'span 2')
  await tile.click()
  const news = page.getByRole('dialog', { name: 'News' })
  await expect(news.getByRole('button', { name: /Library opens a reading garden/ })).toBeVisible()
  await expect(news.getByText('Benches, roses and large-print books.')).toBeVisible()
  await expect(news.getByText('1 hour ago')).toBeVisible()
  await expect(news.getByRole('button', { name: /Bakery wins the pie contest/ })).toBeVisible()

  await news.getByRole('button', { name: /Bakery wins the pie contest/ }).click()
  await expect(page.getByRole('button', { name: '🏠 Home' })).toBeVisible()
  await expect.poll(browserUrls).toContain(`${site}/story-pie`)
  // What she reads stays hers: the log says a story was opened, not which.
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(log.map((e) => e.type)).toEqual(
    expect.arrayContaining(['news-opened', 'news-story-opened'])
  )
  expect(JSON.stringify(log)).not.toContain('story-pie')
  await page.getByRole('button', { name: '🏠 Home' }).click()
  await expect(page.getByRole('dialog', { name: 'News' })).toHaveCount(0)
})

test('Home cannot open an address the News tile did not serve', async () => {
  const tileId = await page.evaluate(() =>
    window.launcher.getConfig().then((c) => c.tiles.find((t) => t.builtinKey === 'news')!.id)
  )
  const result = await page.evaluate(
    (id) => window.launcher.openNews(id, 'https://example.com/not-a-story'),
    tileId
  )
  expect(result.ok).toBe(false)
})

test('a story opens as a safe article, toggles without losing Back, and returns to News', async () => {
  await page.getByRole('button', { name: 'News', exact: true }).click()
  await page.getByRole('button', { name: /Library opens a reading garden/ }).click()
  const article = page.getByRole('region', { name: 'News article' })
  await expect(
    article.getByRole('heading', { name: 'Library opens a reading garden' })
  ).toBeVisible()
  await expect(article.getByText('A place to rest', { exact: true })).toBeVisible()
  await expect(article.locator('a,script,iframe')).toHaveCount(0)
  await expect(article.getByRole('button', { name: /Read aloud/ })).toBeVisible()
  const home = page.getByRole('button', { name: '🏠 Home', exact: true })
  const homeBounds = await home.boundingBox()
  await page.getByRole('button', { name: 'Show page', exact: true }).click()
  await expect(article).toHaveCount(0)
  await page.getByRole('button', { name: 'Show article', exact: true }).click()
  await expect(article).toBeVisible()
  expect(await home.boundingBox()).toEqual(homeBounds)
  await page.screenshot({ path: 'test-results/reader-article.png' })
  await page.getByRole('button', { name: '← Back', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'News' })).toBeVisible()
  await page.getByRole('dialog', { name: 'News' }).getByRole('button', { name: /Home/ }).click()
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(JSON.stringify(log)).not.toContain('story-garden')
})

test('an ordinary web article offers reader mode at every text size', async () => {
  await admin.getByLabel('Tile type').selectOption('web')
  await admin.getByLabel('Tile label').fill('Reading')
  await admin.getByLabel('Website address').fill(`${site}/story-garden`)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await page.getByRole('button', { name: 'Reading', exact: true }).click()
  await page.getByRole('button', { name: 'Show article', exact: true }).click()
  const article = page.getByRole('region', { name: 'News article' })
  await expect(article.getByText('A place to rest', { exact: true })).toBeVisible()
  for (let step = 0; step < 5; step++) {
    await admin.evaluate(async (fontStep) => {
      const config = await window.admin.getConfig()
      await window.admin.setConfig({ display: { ...config.display, fontStep } })
    }, step)
    await expect.poll(() => article.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeInViewport()
  }
  await page.screenshot({ path: 'test-results/reader-largest-text.png' })
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('a broken feed gets a calm line and the news website instead', async () => {
  await admin.getByRole('button', { name: 'Edit News', exact: true }).click()
  await admin.getByLabel('Feed address').fill(`${site}/broken.xml`)
  await admin.getByRole('button', { name: 'Save tile', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.tiles[0]?.feedUrl)))
    .toBe(`${site}/broken.xml`)

  await page.getByRole('button', { name: 'News', exact: true }).click()
  const news = page.getByRole('dialog', { name: 'News' })
  await expect(news.getByText("The news isn't ready right now.")).toBeVisible()
  await expect(news.getByText(/500|error|fail/i)).toHaveCount(0)
  await news.getByRole('button', { name: 'Open the news website' }).click()
  await expect(page.getByRole('button', { name: '🏠 Home' })).toBeVisible()
  await expect.poll(browserUrls).toContain(`${site}/`)
  await page.getByRole('button', { name: '🏠 Home' }).click()
})
