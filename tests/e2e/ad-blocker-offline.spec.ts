import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * What happens when the ad blocker cannot start at all.
 *
 * Blocking is a protection, not a prerequisite: if the filter lists cannot be
 * fetched and no usable engine is cached, browsing must carry on unfiltered with
 * the failure recorded, or a caregiver who is offline once finds every web tile
 * broken. The other spec proves blocking works; this one proves its absence is
 * survivable and visible.
 */

let app: ElectronApplication
let page: Page
let admin: Page
let server: Server
let fixtureUrl: string
let userDataDir: string

const fixture = `<!doctype html>
<title>Unfiltered browsing fixture</title>
<h1>Browsing still works</h1>
<script>
  window.probe = (url) => {
    const image = new Image()
    image.src = url + '?t=' + Math.random()
    document.body.appendChild(image)
    return 'requested'
  }
</script>`

type NetworkEvent = { url: string; error?: string }

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(fixture)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fixtureUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/page`

  userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-adblock-off-'))
  // Force the real startup failure instead of mocking it: the cached engine is a
  // directory, so reading it fails, and the proxy below means the fallback fetch
  // cannot succeed either. startAdBlocker's own catch is what runs.
  mkdirSync(join(userDataDir, 'adblocker-engine.bin'))

  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: {
      ...process.env,
      GRAMMIEGUIDE_E2E: '1',
      // Anything not on localhost dies here.
      HTTP_PROXY: 'http://127.0.0.1:1',
      HTTPS_PROXY: 'http://127.0.0.1:1'
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await app.evaluate(({ session }) => {
    const seen: NetworkEvent[] = []
    ;(globalThis as unknown as { __adRequests: NetworkEvent[] }).__adRequests = seen
    const webRequest = session.fromPartition('persist:web').webRequest
    webRequest.onErrorOccurred((details) => seen.push({ url: details.url, error: details.error }))
    webRequest.onCompleted((details) => seen.push({ url: details.url }))
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
  await admin.getByLabel('Tile type').selectOption('web')
  await admin.getByLabel('Tile label').fill('Garden club')
  await admin.getByLabel('Website address').fill(fixtureUrl)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Garden club', exact: true })).toBeVisible()
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

test('a blocker that cannot start is recorded, and web tiles still open', async () => {
  // Visible to the caregiver, by a name they can search for in the admin log.
  await expect
    .poll(async () => {
      const log = await admin.evaluate(() => window.admin.getActivityLog())
      return log.filter((event) => event.type === 'adblocker-unavailable').length
    }, { timeout: 60_000 })
    .toBeGreaterThan(0)
  const enabled = await admin.evaluate(async () => {
    const log = await window.admin.getActivityLog()
    return log.some((event) => event.type === 'adblocker-enabled')
  })
  expect(enabled).toBe(false)

  // The point of the whole catch: browsing is unaffected.
  await page.getByRole('button', { name: 'Garden club', exact: true }).click()
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, url) => {
        const found = webContents.getAllWebContents().find((w) => w.getURL() === url)
        return found ? !found.isLoading() : false
      }, fixtureUrl)
    )
    .toBe(true)

  const events = await app.evaluate(
    () => (globalThis as unknown as { __adRequests: NetworkEvent[] }).__adRequests
  )
  // The page itself loaded, and nothing was filtered, which is the honest failure
  // mode here: she can browse, and ads are not blocked.
  expect(events.some((event) => event.url === fixtureUrl && !event.error)).toBe(true)
  const adRequest = events.find((event) => event.url.includes('doubleclick.net'))
  expect(adRequest?.error).not.toBe('net::ERR_BLOCKED_BY_CLIENT')
})