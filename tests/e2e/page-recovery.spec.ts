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
let server: Server | null = null
let port: number
let site: string

test.describe.configure({ mode: 'serial' })

const PAGE = `<!doctype html><title>Garden club</title><h1>Garden club</h1>
<a id="blocked" href="ftp://127.0.0.1/secret">A link the kiosk must not follow</a>`

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html')
      // Otherwise the offline test would just show the copy cached by the previous test.
      res.setHeader('Cache-Control', 'no-store')
      res.end(PAGE)
    })
    server.listen(port, '127.0.0.1', () => resolve())
  })
}

test.beforeAll(async () => {
  // Reserve a free port, then close it: until startServer(), nothing answers there.
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  site = `http://127.0.0.1:${port}/`

  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-recovery-'))}`],
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
  await admin.getByLabel('Tile label').fill('Garden club')
  await admin.getByLabel('Website address').fill(site)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Garden club', exact: true })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

/** Whether the web page's native view is showing (it hides behind the recovery screen). */
function pageShowing(): Promise<boolean | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const launcher = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('/launcher/index.html')
    )
    const view = launcher?.contentView.children[0]
    return view ? view.getVisible() : null
  })
}

const navHome = (): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: '🏠 Home', exact: true }).first()
let navHomeBox: { x: number; y: number } | null = null

test('a page that cannot be reached gets a calm screen, never an error code', async () => {
  await page.getByRole('button', { name: 'Garden club', exact: true }).click()
  const screen = page.getByRole('alert', { name: "This page won't open right now." })
  await expect(screen).toBeVisible({ timeout: 15_000 })
  await expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(screen.getByRole('button', { name: '🏠 Home' })).toBeVisible()
  await expect(page.getByText(/ERR_|error|refused|failed/i)).toHaveCount(0)
  expect(await pageShowing()).toBe(false)
  await page.screenshot({ path: 'test-results/page-recovery-unreachable.png' })

  // The caregiver sees which site failed and why, not the full address.
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  const failure = log.find((e) => e.type === 'browser-load-failed')
  expect(failure?.detail).toBe('127.0.0.1: ERR_CONNECTION_REFUSED')
  const box = await navHome().boundingBox()
  navHomeBox = { x: box!.x, y: box!.y }
})

test('Try again opens the page once it can be reached, with Home in the same place', async () => {
  await startServer()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  await expect.poll(pageShowing).toBe(true)
  const box = await navHome().boundingBox()
  expect({ x: box!.x, y: box!.y }).toEqual(navHomeBox)
  await navHome().click()
  await expect(page.getByRole('button', { name: 'Garden club', exact: true })).toBeVisible()
})

type OnlineHook = { __e2e__: { setDeviceOnline: (online: boolean) => void } }

test('offline, it says so and opens the page by itself when the connection is back', async () => {
  // Chromium's own offline emulation stalls loads instead of failing them, so
  // stand in for Windows' online state and make the site really unreachable.
  await new Promise<void>((resolve) => {
    server!.closeAllConnections()
    server!.close(() => resolve())
  })
  await app.evaluate(() => (globalThis as unknown as OnlineHook).__e2e__.setDeviceOnline(false))
  await page.getByRole('button', { name: 'Garden club', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveAccessibleName(
    "The internet isn't working right now.",
    { timeout: 15_000 }
  )
  expect(await pageShowing()).toBe(false)

  await startServer()
  await app.evaluate(() => (globalThis as unknown as OnlineHook).__e2e__.setDeviceOnline(true))
  // No tap: the automatic retry (every 5 s) brings the page back.
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 20_000 })
  await expect.poll(pageShowing).toBe(true)
})

test('a blocked link says so, and Back to the page returns to it', async () => {
  await app.evaluate(({ webContents }, url) => {
    const view = webContents.getAllWebContents().find((w) => w.getURL() === url)!
    return view.executeJavaScript(`document.getElementById('blocked').click()`, true)
  }, site)
  const screen = page.getByRole('alert', { name: "That page can't be opened here." })
  await expect(screen).toBeVisible({ timeout: 15_000 })
  expect(await pageShowing()).toBe(false)
  await screen.getByRole('button', { name: 'Back to the page' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(pageShowing).toBe(true)
  await navHome().click()
})
