import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

type Check = { activity: number; preloadErrors: string[] }

let app: ElectronApplication
let page: Page
let admin: Page
let server: Server
let site: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Plain page</title><h1>A page to tap</h1>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-sandbox-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Watch every later page (admin, the web view) for preload failures and count the web
  // view's activity reports, before any of them exist.
  await app.evaluate(({ app, ipcMain }) => {
    const state: Check = { activity: 0, preloadErrors: [] }
    ;(globalThis as unknown as { __sandboxCheck: Check }).__sandboxCheck = state
    ipcMain.on('browserView:activity', () => state.activity++)
    app.on('web-contents-created', (_event, contents) => {
      contents.on('preload-error', (_e, path, error) =>
        state.preloadErrors.push(`${path}: ${String(error)}`)
      )
    })
  })

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

function check(): Promise<Check> {
  return app.evaluate(() => (globalThis as unknown as { __sandboxCheck: Check }).__sandboxCheck)
}

test('Home and admin run sandboxed, and their bridges still work', async () => {
  const sandboxed = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((win) => win.webContents.getLastWebPreferences()?.sandbox)
  )
  expect(sandboxed).toEqual([true, true])
  expect(await page.evaluate(() => typeof window.launcher.getConfig)).toBe('function')
  expect(await admin.evaluate(() => typeof window.admin.getConfig)).toBe('function')
})

test('a tap inside a web page reaches main, so it resets the idle timer', async () => {
  await admin.getByLabel('Tile label').fill('Plain page')
  await admin.getByLabel('Website address').fill(site)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await page.getByRole('button', { name: 'Plain page', exact: true }).click()
  await expect(page.getByRole('button', { name: '🏠 Home' })).toBeVisible()
  // A generous wait: on a busy machine the first page load has taken longer than 5s.
  await expect
    .poll(
      () =>
        app.evaluate(
          ({ webContents }, url) =>
            webContents.getAllWebContents().some((w) => w.getURL() === url && !w.isLoading()),
          site
        ),
      { timeout: 15_000 }
    )
    .toBe(true)
  // Her tap on the tile was reported by Home itself; only taps inside the page count here.
  const before = (await check()).activity

  // A real mouse press inside the page, arriving the way her finger would.
  const viewSandboxed = await app.evaluate(({ webContents }, url) => {
    const view = webContents.getAllWebContents().find((w) => w.getURL() === url)!
    view.focus()
    view.sendInputEvent({ type: 'mouseDown', x: 100, y: 100, button: 'left', clickCount: 1 })
    view.sendInputEvent({ type: 'mouseUp', x: 100, y: 100, button: 'left', clickCount: 1 })
    return view.getLastWebPreferences()?.sandbox
  }, site)

  expect(viewSandboxed).toBe(true)
  await expect.poll(async () => (await check()).activity).toBeGreaterThan(before)
  expect((await check()).preloadErrors).toEqual([])
  await page.getByRole('button', { name: '🏠 Home' }).click()
})
