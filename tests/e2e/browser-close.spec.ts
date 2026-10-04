import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let app: ElectronApplication
let page: Page
let server: Server
let fixtureUrl: string
/** Reserved then closed, so nothing answers there until a test starts a server. */
let deadUrl: string

const fixture = `<!doctype html>
<title>Browser close audio fixture</title>
<h1>A quiet tone</h1>
<script>
  window.startAudio = async () => {
    if (!window.audioContext) {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      window.audioContext = context;
    }
    await window.audioContext.resume();
  };
  // Even a site that asks to stay open must stop when she taps Home.
  window.addEventListener('beforeunload', (event) => {
    event.preventDefault();
    event.returnValue = '';
  });
</script>`

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(fixture)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fixtureUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/audio`
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  deadUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}/gone`
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-browser-close-'))}`],
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
  const admin = await opened
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
  await admin.getByLabel('Tile type').selectOption('web')
  await admin.getByLabel('Tile label').fill('Quiet tone')
  await admin.getByLabel('Website address').fill(fixtureUrl)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Quiet tone', exact: true })).toBeVisible()
  // A second tile that cannot load, so the recovery screen's own Home is reachable.
  await admin.getByLabel('Tile type').selectOption('web')
  await admin.getByLabel('Tile label').fill('Missing site')
  await admin.getByLabel('Website address').fill(deadUrl)
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Missing site', exact: true })).toBeVisible()
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

async function browserState(): Promise<{
  ids: number[]
  fixturePages: number
  audiblePages: number
}> {
  return app.evaluate(({ webContents }, url) => {
    const contents = webContents.getAllWebContents()
    return {
      ids: contents.map((w) => w.id).sort((a, b) => a - b),
      fixturePages: contents.filter((w) => w.getURL() === url).length,
      audiblePages: contents.filter((w) => w.isCurrentlyAudible()).length
    }
  }, fixtureUrl)
}

/** Every open web page, not just the audio fixture, so a dead tile still counts. */
function openPageCount(): Promise<number> {
  return app.evaluate(({ webContents }) => {
    return webContents
      .getAllWebContents()
      .filter((w) => w.getURL().startsWith('http://127.0.0.1')).length
  })
}

test('Home stops audible playback, closes the page, and repeated opens leave no hidden pages', async () => {
  const baseline = await browserState()
  expect(baseline.fixturePages).toBe(0)
  expect(baseline.audiblePages).toBe(0)
  const tile = page.getByRole('button', { name: 'Quiet tone', exact: true })
  const home = page.getByRole('button', { name: '🏠 Home', exact: true })

  // The first close proves playback stops; five more catch accumulated hidden pages.
  for (let cycle = 0; cycle < 6; cycle++) {
    await tile.click()
    await expect(home).toBeVisible()
    await expect
      .poll(() =>
        app.evaluate(({ webContents }, url) => {
          const contents = webContents.getAllWebContents().find((w) => w.getURL() === url)
          return contents ? !contents.isLoading() : false
        }, fixtureUrl)
      )
      .toBe(true)

    // A user gesture starts Web Audio without changing the app's autoplay preferences.
    await app.evaluate(async ({ webContents }, url) => {
      const contents = webContents.getAllWebContents().find((w) => w.getURL() === url)
      if (!contents) throw new Error('Audio fixture page was not opened')
      await contents.executeJavaScript('window.startAudio()', true)
    }, fixtureUrl)
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .some((w) => w.getURL() === url && w.isCurrentlyAudible()),
          fixtureUrl
        )
      )
      .toBe(true)
    const playing = await browserState()
    expect(playing.fixturePages).toBe(1)
    expect(playing.ids).toHaveLength(baseline.ids.length + 1)

    await home.click()
    await expect(tile).toBeVisible()
    // Match the original IDs too, so closing the launcher or admin cannot mask a leak.
    await expect.poll(browserState).toEqual(baseline)
  }
})

type E2eHooks = { __e2e__: { closeBrowserIfIdle: (extraIdleMs?: number) => void } }

test('the idle timeout also closes the page and stops its sound, not just hides it', async () => {
  const baseline = await browserState()
  await page.getByRole('button', { name: 'Quiet tone', exact: true }).click()
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, url) => {
        const contents = webContents.getAllWebContents().find((w) => w.getURL() === url)
        return contents ? !contents.isLoading() : false
      }, fixtureUrl)
    )
    .toBe(true)
  await app.evaluate(async ({ webContents }, url) => {
    const contents = webContents.getAllWebContents().find((w) => w.getURL() === url)
    await contents!.executeJavaScript('window.startAudio()', true)
  }, fixtureUrl)
  await expect.poll(async () => (await browserState()).audiblePages).toBe(1)

  // The real idle check: not idle long enough yet, so the page stays...
  await app.evaluate(() => (globalThis as unknown as E2eHooks).__e2e__.closeBrowserIfIdle())
  expect((await browserState()).fixturePages).toBe(1)
  // ...then as if a whole day had passed without a tap.
  await app.evaluate(() =>
    (globalThis as unknown as E2eHooks).__e2e__.closeBrowserIfIdle(24 * 60 * 60_000)
  )
  await expect(page.getByRole('button', { name: 'Quiet tone', exact: true })).toBeVisible()
  await expect.poll(browserState).toEqual(baseline)
})

test('leaving via the recovery screen closes the page instead of hiding it', async () => {
  await page.getByRole('button', { name: 'Missing site', exact: true }).click()
  const screen = page.getByRole('alert')
  await expect(screen).toBeVisible({ timeout: 15_000 })
  // A live page exists underneath the recovery screen; Home must end it, not blank it.
  await expect.poll(openPageCount).toBe(1)

  await screen.getByRole('button', { name: '🏠 Home' }).click()
  await expect(page.getByRole('button', { name: 'Missing site', exact: true })).toBeVisible()
  await expect.poll(openPageCount).toBe(0)
})
