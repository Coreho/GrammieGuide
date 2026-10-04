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
let fixtureUrl: string
/** The temp user-data dir, so we can prove no download ever lands on disk. */
let userDataDir: string

/**
 * A page that tries every door out of the kiosk: asks for permissions, tries the
 * camera and fires a download. None of it may work.
 */
const fixture = `<!doctype html>
<title>Hardened session fixture</title>
<h1>Nothing here should work</h1>
<script>
  window.probe = async () => {
    const out = {}
    try {
      out.notifications = (await navigator.permissions.query({ name: 'notifications' })).state
    } catch (error) { out.notifications = 'threw: ' + error.name }
    try {
      out.geolocation = (await navigator.permissions.query({ name: 'geolocation' })).state
    } catch (error) { out.geolocation = 'threw: ' + error.name }
    try {
      out.microphone = (await navigator.permissions.query({ name: 'microphone' })).state
    } catch (error) { out.microphone = 'threw: ' + error.name }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      out.getUserMedia = 'granted'
    } catch (error) { out.getUserMedia = 'refused: ' + error.name }
    try {
      // Without a location provider Chromium may simply never answer, so give it
      // a deadline: what matters is that it never reports success.
      out.geolocationRequest = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('no-answer'), 3000)
        navigator.geolocation.getCurrentPosition(
          () => { clearTimeout(timer); resolve('granted') },
          (error) => { clearTimeout(timer); resolve('refused: ' + error.code) }
        )
      })
    } catch (error) { out.geolocationRequest = 'refused: ' + error.name }
    return out
  }

  window.startDownload = () => {
    const link = document.createElement('a')
    link.href = 'free-money.zip'
    link.download = 'free-money.zip'
    document.body.appendChild(link)
    link.click()
    return 'clicked'
  }
</script>`

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/free-money.zip') {
      // An attachment, so the browser treats it as a download instead of a page.
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', 'attachment; filename="free-money.zip"')
      res.end('not really a zip')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(fixture)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fixtureUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/page`

  userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-harden-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
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
  await admin.getByLabel('Tile type').selectOption('web')
  await admin.getByLabel('Tile label').fill('Shady site')
  await admin.getByLabel('Website address').fill(fixtureUrl)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Shady site', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Shady site', exact: true }).click()
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, url) => {
        const found = webContents.getAllWebContents().find((w) => w.getURL() === url)
        return found ? !found.isLoading() : false
      }, fixtureUrl)
    )
    .toBe(true)
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  }
})

async function inFixture<T>(expression: string): Promise<T> {
  // app.evaluate stringifies its function, so the expression travels as an argument.
  return app.evaluate(
    async ({ webContents }, payload) => {
      const contents = webContents.getAllWebContents().find((w) => w.getURL() === payload.url)
      if (!contents) throw new Error('The fixture page is not open')
      return contents.executeJavaScript(payload.expression, true) as Promise<never>
    },
    { url: fixtureUrl, expression }
  )
}

test('web tiles run in their own persistent session, separate from the app windows', async () => {
  const paths = await app.evaluate(({ webContents, session }) => {
    const launcher = webContents
      .getAllWebContents()
      .find((w) => w.getURL().endsWith('/launcher/index.html'))
    const web = webContents
      .getAllWebContents()
      .find((w) => w.getURL().startsWith('http://127.0.0.1'))
    const launcherPath = launcher?.session.getStoragePath() ?? null
    const webPath = web?.session.getStoragePath() ?? null
    return {
      launcherPath,
      webPath,
      sameSession: launcher?.session === web?.session,
      defaultSessionIsLauncher: launcher?.session === session.defaultSession
    }
  })

  // A different session, so the deny-all rules below cannot touch Home or admin.
  expect(paths.sameSession).toBe(false)
  expect(paths.defaultSessionIsLauncher).toBe(true)
  // Its own on-disk storage, which is what makes site logins survive a restart.
  expect(paths.webPath).toBeTruthy()
  expect(paths.webPath).not.toBe(paths.launcherPath)
})

test('every permission request from a web page is denied', async () => {
  const probe = await inFixture<{
    notifications: string
    geolocation: string
    microphone: string
    getUserMedia: string
    geolocationRequest: string
  }>('window.probe()')

  expect(probe.notifications).toBe('denied')
  expect(probe.geolocation).toBe('denied')
  expect(probe.microphone).toBe('denied')
  // Asking is not enough: the device itself must stay out of reach.
  expect(probe.getUserMedia).toMatch(/^refused:/)
  expect(probe.geolocationRequest).not.toBe('granted')
})

test('a download is cancelled and logged as browser-download-blocked', async () => {
  expect(await inFixture<string>('window.startDownload()')).toBe('clicked')
  await expect
    .poll(async () => {
      const log = await admin.evaluate(() => window.admin.getActivityLog())
      return log.filter((event) => event.type === 'browser-download-blocked').length
    })
    .toBeGreaterThan(0)

  // Nothing reached the disk: no download directory, and nothing in userData.
  const { existsSync } = await import('node:fs')
  const { readdirSync } = await import('node:fs')
  expect(existsSync(join(userDataDir, 'Downloads'))).toBe(false)
  const stray = readdirSync(userDataDir, { recursive: true }).filter((entry) =>
    String(entry).includes('free-money')
  )
  expect(stray).toEqual([])
})
