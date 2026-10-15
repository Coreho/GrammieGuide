import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let app: ElectronApplication
let page: Page
let admin: Page
let source: Server
let other: Server
let site: string
let outside: string
let targetRequests = 0

test.describe.configure({ mode: 'serial' })

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

test.beforeAll(async () => {
  other = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.url === '/picture.svg') {
      res.setHeader('Content-Type', 'image/svg+xml')
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>'
      )
    } else if (req.url === '/script.js') {
      res.setHeader('Content-Type', 'text/javascript')
      res.end('window.crossDomainScript = true')
    } else if (req.url === '/story-redirect' || req.url === '/frame-redirect') {
      res.writeHead(302, {
        Location: `${outside}${req.url === '/frame-redirect' ? '/frame' : '/target?private-redirect=1'}`
      })
      res.end()
    } else {
      if (req.url?.startsWith('/target')) targetRequests++
      res.setHeader('Content-Type', 'text/html')
      res.end(
        `<!doctype html><title>Other site</title><h1>Other site</h1><a id="leave" href="${outside}/target?private-link=1">Another page</a>`
      )
    }
  })
  outside = `http://localhost:${await listen(other)}`
  source = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: `${outside}/target?from=redirect` })
      res.end()
    } else if (req.url === '/feed.xml') {
      res.setHeader('Content-Type', 'application/rss+xml')
      res.end(
        `<rss version="2.0"><channel><title>Garden news</title><item><title>Garden story</title><link>${outside}/story</link></item><item><title>Redirect story</title><link>${outside}/story-redirect</link></item></channel></rss>`
      )
    } else {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<!doctype html><title>Garden</title><h1>Garden</h1>
        <img id="picture" src="${outside}/picture.svg">
        <script src="${outside}/script.js"></script>
        <iframe src="${outside}/frame-redirect"></iframe>
        <a id="leave" href="${outside}/target?private-path=1">Other site</a>`)
    }
  })
  site = `http://127.0.0.1:${await listen(source)}`
  mkdirSync('test-results', { recursive: true })
  app = await electron.launch({
    args: [
      '.',
      `--user-data-dir=${mkdtempSync(join(process.cwd(), 'test-results', 'approved-sites-'))}`
    ],
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
  await admin.getByLabel('Tile label').fill('Garden')
  await admin.getByLabel('Website address').fill(`${site}/`)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Garden', exact: true })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  for (const server of [source, other]) {
    server?.closeAllConnections()
    server?.close()
  }
})

async function clickLink(url: string): Promise<void> {
  await app.evaluate(({ webContents }, target) => {
    const contents = webContents.getAllWebContents().find((w) => w.getURL() === target)!
    return contents.executeJavaScript("document.getElementById('leave').click()", true)
  }, url)
}

async function urls(): Promise<string[]> {
  return app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()))
}

async function viewVisible(): Promise<boolean | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const launcher = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('/launcher/index.html')
    )
    return launcher?.contentView.children[0]?.getVisible() ?? null
  })
}

const recovery = (): ReturnType<Page['getByRole']> =>
  page.getByRole('alert', { name: "That page can't be opened here." })
const home = (): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: '🏠 Home', exact: true }).first()

test('cross-domain resources load, a link is blocked, and admin approval allows it live', async () => {
  await page.getByRole('button', { name: 'Garden', exact: true }).click()
  await expect.poll(urls).toContain(`${site}/`)
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, target) => {
        const contents = webContents.getAllWebContents().find((w) => w.getURL() === target)!
        return contents.executeJavaScript(
          `Boolean(document.querySelector('#picture')?.naturalWidth && window.crossDomainScript)`
        )
      }, `${site}/`)
    )
    .toBe(true)
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, target) => {
        const contents = webContents.getAllWebContents().find((w) => w.getURL() === target)!
        return contents.mainFrame.frames.map((frame) => frame.url)
      }, `${site}/`)
    )
    .toContain(`${outside}/frame`)
  expect(await viewVisible()).toBe(true)

  await clickLink(`${site}/`)
  await expect(recovery()).toBeVisible()
  await expect(recovery().getByRole('button', { name: 'Back to the page' })).toBeVisible()
  await expect(recovery().getByRole('button', { name: '🏠 Home' })).toBeVisible()
  expect(await viewVisible()).toBe(false)
  expect(targetRequests).toBe(0)
  await admin.getByRole('button', { name: 'Sites', exact: true }).click()
  const attempt = admin.getByRole('listitem').filter({ hasText: 'localhost' })
  await expect(attempt).toContainText('localhost')
  await attempt.getByRole('button', { name: 'Approve this site' }).click()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((cfg) => cfg.approvedSites)))
    .toEqual(['localhost'])
  await recovery().getByRole('button', { name: 'Back to the page' }).click()
  await clickLink(`${site}/`)
  await expect.poll(urls).toContain(`${outside}/target?private-path=1`)
  expect(await viewVisible()).toBe(true)
  expect(targetRequests).toBe(1)
  await home().click()
  await admin.getByRole('button', { name: 'Remove localhost', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((cfg) => cfg.approvedSites)))
    .toEqual([])
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  const blocks = log.filter((entry) => entry.type === 'browser-navigation-blocked')
  expect(blocks.some((entry) => entry.detail === 'localhost')).toBe(true)
  expect(JSON.stringify(blocks)).not.toContain('private-path')
})

test('a fresh tile redirect is stopped before the target loads and Back returns Home', async () => {
  await admin.evaluate(async (base) => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      tiles: [
        ...cfg.tiles,
        {
          id: 'redirect',
          type: 'web',
          label: 'Redirect',
          url: `${base}/redirect`,
          size: 'normal',
          colorIndex: 1,
          slot: 1
        }
      ]
    })
  }, site)
  const before = targetRequests
  await page.getByRole('button', { name: 'Redirect', exact: true }).click()
  await expect(recovery()).toBeVisible()
  expect(await viewVisible()).toBe(false)
  expect(targetRequests).toBe(before)
  await recovery().getByRole('button', { name: 'Back to the page' }).click()
  await expect(page.getByRole('button', { name: 'Garden', exact: true })).toBeVisible()
  expect(await viewVisible()).toBeNull()
})

test('only the served News story is exempt; its links and redirects are blocked privately', async () => {
  await admin.evaluate(async (base) => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      tiles: [
        ...cfg.tiles,
        {
          id: 'news',
          type: 'builtin',
          builtinKey: 'news',
          label: 'News',
          url: base,
          feedUrl: `${base}/feed.xml`,
          size: 'normal',
          colorIndex: 2,
          slot: 2
        }
      ]
    })
  }, site)
  const before = targetRequests
  const logCount = await admin.evaluate(() =>
    window.admin.getActivityLog().then((log) => log.length)
  )
  const reliabilityBefore = await admin.evaluate(() => window.admin.getReliabilityLog())
  await page.getByRole('button', { name: 'News', exact: true }).click()
  await page.getByRole('button', { name: /Garden story/ }).click()
  await expect.poll(urls).toContain(`${outside}/story`)
  await clickLink(`${outside}/story`)
  await expect(recovery()).toBeVisible()
  expect(await viewVisible()).toBe(false)
  expect(targetRequests).toBe(before)
  await recovery().getByRole('button', { name: 'Back to the page' }).click()
  expect(await viewVisible()).toBe(true)
  await home().click()
  await page.getByRole('button', { name: 'News', exact: true }).click()
  await page.getByRole('button', { name: /Redirect story/ }).click()
  await expect(recovery()).toBeVisible()
  expect(await viewVisible()).toBe(false)
  expect(targetRequests).toBe(before)
  const logs = await admin.evaluate(() => window.admin.getActivityLog())
  // Compare only events from this private browsing session.
  const privateLogs = logs.slice(logCount)
  expect(privateLogs.some((entry) => entry.type === 'browser-navigation-blocked')).toBe(true)
  expect(JSON.stringify(privateLogs)).not.toMatch(
    /localhost|private-link|private-redirect|story-redirect/
  )
  const reliability = await admin.evaluate(() => window.admin.getReliabilityLog())
  expect(
    JSON.stringify(
      reliability.filter(
        (entry) => !reliabilityBefore.some((old) => JSON.stringify(old) === JSON.stringify(entry))
      )
    )
  ).not.toMatch(/localhost|private-link|private-redirect/)
  await home().click()
})

test('locked admin cannot read blocked history or change approvals', async () => {
  await admin.evaluate(() => window.admin.lock())
  await expect(admin.evaluate(() => window.admin.getBlockedSites())).rejects.toThrow(
    'admin unlock required'
  )
  await expect(
    admin.evaluate(() => window.admin.setConfig({ approvedSites: ['localhost'] }))
  ).rejects.toThrow('admin unlock required')
})
