import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

// She uses a mouse. These drive real mouse events, because a double-click is two presses at one
// spot and the first has already changed what is under the pointer.
let app: ElectronApplication
let page: Page
let root: string
let server: Server
test.describe.configure({ mode: 'serial' })

const KNITTING = {
  project: { name: 'Blue scarf', forWhom: 'Ella', rows: 3 },
  patterns: [
    {
      id: 'p1',
      name: 'Cable scarf',
      lastPage: 0,
      pages: [{}, {}, {}, {}, {}]
    },
    { id: 'p2', name: 'Lace shawl', lastPage: 0, pages: [{}, {}] }
  ],
  pieces: [],
  ravelry: [
    {
      id: 'r1',
      name: 'Sweet Shop Blanket',
      designer: 'A designer',
      facts: [{ label: 'Yarn', value: 'DK' }],
      notes: 'Plenty of words about it. '.repeat(300),
      pictures: [{}, {}],
      ravelryId: 5,
      pages: [],
      lastPage: 0
    }
  ]
}

const knittingTile = (): Locator => page.getByRole('button', { name: 'Knitting', exact: true })
const webTile = (): Locator => page.getByRole('button', { name: 'Local page', exact: true })
const shelf = (): Locator => page.getByRole('dialog', { name: 'Knitting' })
const shelfHeading = (): Locator => shelf().locator('h1')
const veil = (): Locator => page.locator('[data-idle-dimmed]')

async function doubleClick(target: Locator): Promise<void> {
  const box = (await target.boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, { delay: 90 })
}

async function backToPlainHome(): Promise<void> {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(knittingTile()).toBeVisible()
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-mouse-'))
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end('<!doctype html><title>Local</title><p style="height:2000px">A page to read</p>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const config = defaultConfig()
  config.display.homeLayout = 'simple4'
  config.display.idleDim = { enabled: true, afterMinutes: 10, level: 0.4 }
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
      id: 'web',
      label: 'Local page',
      type: 'web',
      url: `http://127.0.0.1:${port}/`,
      size: 'normal',
      slot: 1,
      colorIndex: 1
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
  await app.evaluate(({ ipcMain }, data) => {
    const calls = globalThis as unknown as { __rowCalls: number }
    calls.__rowCalls = 0
    ipcMain.removeHandler('knitting:home')
    ipcMain.handle('knitting:home', () => data)
    ipcMain.removeHandler('knitting:changeRows')
    ipcMain.handle('knitting:changeRows', () => {
      calls.__rowCalls += 1
      return data
    })
  }, KNITTING)
  await expect(knittingTile()).toBeVisible()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    server?.close()
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('double-clicking a tile opens the tile, not the first thing inside it', async () => {
  await doubleClick(knittingTile())
  await expect(shelfHeading()).toHaveText('Knitting')
  await expect(shelf().locator('[data-knitting-card="project"]')).toBeVisible()
})

test('double-clicking Back goes back one step, not two', async () => {
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await expect(shelfHeading()).toHaveText('Patterns')
  await doubleClick(shelf().getByRole('button', { name: 'Back to Knitting', exact: true }))
  await expect(shelfHeading()).toHaveText('Knitting')
})

test('double-clicking Next turns one page, and a later click turns the next', async () => {
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await shelf().locator('[data-pattern-card="p1"]').click()
  const next = shelf().getByRole('button', { name: 'Next page' })
  await expect(shelf().getByText('Page 1 of 5')).toBeVisible()
  await doubleClick(next)
  await expect(shelf().getByText('Page 2 of 5')).toBeVisible()
  await next.click()
  await expect(shelf().getByText('Page 3 of 5')).toBeVisible()
})

test('double-clicking Add a row sends one row', async () => {
  await backToPlainHome()
  await knittingTile().click()
  await shelf().locator('[data-knitting-card="project"]').click()
  await doubleClick(shelf().getByRole('button', { name: /Add a row/ }))
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { __rowCalls: number }).__rowCalls))
    .toBe(1)
})

test('quick repeats still work where they are the point', async () => {
  await backToPlainHome()
  const counts = await page.evaluate(() => {
    const counts = { game: 0, plain: 0, box: 0 }
    const add = (html: string, name: keyof typeof counts): void => {
      const holder = document.createElement('div')
      holder.innerHTML = html
      holder.style.cssText = 'position:fixed;left:10px;width:80px;height:40px;z-index:99999'
      holder.style.top = `${Object.keys(counts).indexOf(name) * 50 + 10}px`
      holder.firstElementChild!.addEventListener('click', () => (counts[name] += 1))
      holder.id = `probe-${name}`
      document.body.append(holder)
    }
    add('<button data-game-interactive style="width:100%;height:100%">g</button>', 'game')
    add('<button style="width:100%;height:100%">p</button>', 'plain')
    add('<input style="width:100%;height:100%">', 'box')
    ;(window as unknown as { __counts: typeof counts }).__counts = counts
    return counts
  })
  expect(counts).toEqual({ game: 0, plain: 0, box: 0 })
  await doubleClick(page.locator('#probe-game > *'))
  await doubleClick(page.locator('#probe-plain > *'))
  await doubleClick(page.locator('#probe-box > *'))
  expect(await page.evaluate(() => (window as unknown as { __counts: unknown }).__counts)).toEqual({
    game: 2,
    plain: 1,
    box: 2
  })
})

test('the keyboard still activates a button straight after a mouse click', async () => {
  await backToPlainHome()
  await knittingTile().click()
  await shelf().locator('[data-knitting-card="patterns"]').click()
  await shelf().getByRole('button', { name: 'Back to Knitting', exact: true }).click()
  await expect(shelfHeading()).toHaveText('Knitting')
  await shelf().locator('[data-knitting-card="patterns"]').focus()
  await page.keyboard.press('Enter')
  await expect(shelfHeading()).toHaveText('Patterns')
})

test('long text has a scrollbar wide enough to grab, and the wheel moves it', async () => {
  await backToPlainHome()
  await knittingTile().click()
  await shelf().locator('[data-knitting-card="ravelry"]').click()
  await shelf().locator('[data-ravelry-card="r1"]').click()
  const words = shelf().locator('.knitting-ravelry-words')
  await expect(words).toBeVisible()
  expect(await words.evaluate((el) => el.offsetWidth - el.clientWidth)).toBeGreaterThanOrEqual(24)

  const box = (await words.boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 100)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => words.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})

test('moving the mouse brightens a dimmed Home, and her click then counts', async () => {
  await backToPlainHome()
  await page.clock.install()
  const box = (await knittingTile().boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // The browser measures movement from the last position, so she has to have been somewhere.
  await page.mouse.move(x - 60, y)
  await page.clock.fastForward('10:30')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')

  await page.mouse.move(x, y, { steps: 4 })
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')

  // The click opens the tile: the mouse movement already woke the screen.
  await knittingTile().click()
  await expect(shelf()).toBeVisible()
})

test('a mouse nudge of a pixel or two leaves it dimmed', async () => {
  await backToPlainHome()
  await page.mouse.move(300, 300)
  await page.clock.fastForward('10:30')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
  await page.mouse.move(301, 300)
  await page.clock.runFor(1_000)
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
})

test('moving the mouse over a page counts as using it', async () => {
  await backToPlainHome()
  await app.evaluate(({ ipcMain }) => {
    const seen = globalThis as unknown as { __pageActivity: number }
    seen.__pageActivity = 0
    ipcMain.on('browserView:activity', () => (seen.__pageActivity += 1))
  })
  await webTile().click()
  const activity = (): Promise<number> =>
    app.evaluate(() => (globalThis as unknown as { __pageActivity: number }).__pageActivity)

  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((w) => w.getURL().startsWith('http://127.0.0.1'))
      )
    )
    .toBe(true)
  const moveTo = (x: number): Promise<void> =>
    app.evaluate(({ webContents }, x) => {
      webContents
        .getAllWebContents()
        .find((w) => w.getURL().startsWith('http://127.0.0.1'))!
        .sendInputEvent({ type: 'mouseMove', x, y: 100 })
    }, x)

  // One move only: test windows draw no frames, and Chromium holds later moves for the next frame,
  // so ignoring a small move can't be proven here. The unit tests hold the size rule.
  await moveTo(200)
  await expect.poll(activity).toBe(1)
})
