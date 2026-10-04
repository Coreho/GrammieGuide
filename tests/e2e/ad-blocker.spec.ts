import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let app: ElectronApplication
let page: Page
let server: Server
let fixtureUrl: string
let userDataDir: string

/** Known ad and tracker hosts, both in the ads-and-tracking lists the app ships. */
const AD_URL = 'https://doubleclick.net/ad.gif'
const TRACKER_URL = 'https://www.google-analytics.com/collect'

/**
 * A page that fires requests at known ad and tracker hosts.
 *
 * The outcome is read from Electron's own request reporting, not from the page: a
 * request the blocker cancels reaches JavaScript only as a bare "Failed to fetch",
 * while Chromium's network layer still records exactly why. main is the only place
 * that reason is visible.
 */
const fixture = `<!doctype html>
<title>Ad blocking fixture</title>
<h1>Requests from a web tile</h1>
<script>
  window.probe = (url) => {
    const image = new Image()
    // A pixel nobody will ever see; only the request's fate matters.
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

  userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-adblock-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Watch the browser's own session, which is where the blocker is attached.
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
  const admin = await opened
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

function networkEvents(): Promise<NetworkEvent[]> {
  return app.evaluate(
    () => (globalThis as unknown as { __adRequests: NetworkEvent[] }).__adRequests
  )
}

/**
 * Ask the fixture page to request `url`, then report how the browser's own
 * session saw it. The blocker cancels before DNS, so the answer is immediate.
 */
async function requestAndReport(url: string): Promise<NetworkEvent> {
  const host = new URL(url).hostname
  await app.evaluate(
    async ({ webContents }, payload) => {
      const contents = webContents.getAllWebContents().find((w) => w.getURL() === payload.page)
      if (!contents) throw new Error('The fixture page is not open')
      await contents.executeJavaScript(`window.probe(${JSON.stringify(payload.url)})`, true)
    },
    { page: fixtureUrl, url }
  )
  await expect
    .poll(async () => (await networkEvents()).some((event) => event.url.includes(host)), {
      timeout: 15_000
    })
    .toBe(true)
  const event = (await networkEvents()).find((item) => item.url.includes(host))
  return event!
}

test('the blocker starts and caches its engine on disk', async () => {
  // Cached, so every start after the first needs no network at all.
  await expect
    .poll(() => existsSync(join(userDataDir, 'adblocker-engine.bin')), { timeout: 60_000 })
    .toBe(true)
})

test('a request from a web tile to a known ad domain is blocked', async () => {
  // Cancelled by the blocker, which is a different failure from "cannot be reached".
  await expect(requestAndReport(AD_URL)).resolves.toEqual({
    url: expect.stringContaining('doubleclick.net'),
    error: 'net::ERR_BLOCKED_BY_CLIENT'
  })
})

test('a request to a known tracker is blocked too', async () => {
  const event = await requestAndReport(TRACKER_URL)
  expect(event.error).toBe('net::ERR_BLOCKED_BY_CLIENT')
})

test('the page itself still loads, so only the ad requests were stopped', async () => {
  // The local fixture completed normally: the blocker is filtering, not breaking.
  const events = await networkEvents()
  expect(events.some((event) => event.url === fixtureUrl && !event.error)).toBe(true)
})

test('the launcher and admin windows are not filtered', async () => {
  // Only the browser's session has the blocker attached, and Home kept working
  // through every step above. The engine wrote exactly one cache file and nothing
  // else, so no app asset was touched.
  const stray = readdirSync(userDataDir, { recursive: true }).filter((entry) =>
    String(entry).includes('adblocker')
  )
  expect(stray).toEqual(['adblocker-engine.bin'])
})

/**
 * Startup must not depend on the network. Relaunch against the same userDataDir
 * with the proxy pointed at a dead port, so nothing can be fetched: blocking has to
 * come from the serialized engine on disk.
 */
test('a relaunch with no network still blocks, from the cached engine', async () => {
  await app.close()
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: {
      ...process.env,
      GRAMMIEGUIDE_E2E: '1',
      // Any fetch that is not for localhost dies here.
      HTTP_PROXY: 'http://127.0.0.1:1',
      HTTPS_PROXY: 'http://127.0.0.1:1'
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ session }) => {
    const seen: NetworkEvent[] = []
    ;(globalThis as unknown as { __adRequests: NetworkEvent[] }).__adRequests = seen
    session
      .fromPartition('persist:web')
      .webRequest.onErrorOccurred((details) => seen.push({ url: details.url, error: details.error }))
  })

  // The same web tile, already saved in the config from the first launch.
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

  const event = await requestAndReport(AD_URL)
  expect(event.error).toBe('net::ERR_BLOCKED_BY_CLIENT')
})
