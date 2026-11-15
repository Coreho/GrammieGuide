import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
let server: Server
let videoUrl: string
let ideasUrl: string
const errors: string[] = []
test.describe.configure({ mode: 'serial' })

const shelf = (): ReturnType<Page['getByRole']> => page.getByRole('dialog', { name: 'Knitting' })
const card = (name: string): ReturnType<Page['locator']> =>
  shelf().locator(`[data-knitting-card="${name}"]`)
const linkList = (): ReturnType<Page['getByRole']> =>
  admin.getByRole('list', { name: 'Saved videos and ideas' })
const recovery = (): ReturnType<Page['getByRole']> =>
  page.getByRole('alert', { name: "That page can't be opened here." })
const home = (): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: '🏠 Home', exact: true }).first()

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

async function addLink(label: string, url: string): Promise<void> {
  await admin.getByLabel('Name she sees').fill(label)
  await admin.getByLabel('Address', { exact: true }).fill(url)
  await admin.getByRole('button', { name: 'Add to her shelf', exact: true }).click()
  await expect(
    admin.getByRole('status').filter({ hasText: `${label} is on her Knitting shelf.` })
  ).toBeVisible()
}

async function removeLink(label: string): Promise<void> {
  await linkList()
    .getByRole('button', { name: `Remove ${label}`, exact: true })
    .click()
  await expect(
    admin.getByRole('status').filter({ hasText: `${label} is off her Knitting shelf.` })
  ).toBeVisible()
}

async function viewUrl(): Promise<string | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const launcher = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('/launcher/index.html')
    )
    const view = launcher?.contentView.children[0] as
      { webContents?: { getURL(): string } } | undefined
    return view?.webContents?.getURL() ?? null
  })
}

async function viewVisible(): Promise<boolean | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const launcher = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('/launcher/index.html')
    )
    return launcher?.contentView.children[0]?.getVisible() ?? null
  })
}

/** The next file picker returns this one file. */
async function pickNext(name: string): Promise<void> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 450
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#5b7fb8'
    ctx.fillRect(0, 0, 600, 450)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const path = join(root, name)
  writeFileSync(path, Buffer.from(data, 'base64'))
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }
  }, path)
}

test.beforeAll(async () => {
  const media = readFileSync('tests/fixtures/video.webm')
  server = createServer((req, res) => {
    const port = (server.address() as AddressInfo).port
    if (req.url === '/tone.webm') {
      res.setHeader('Content-Type', 'video/webm')
      res.end(media)
      return
    }
    res.setHeader('Content-Type', 'text/html')
    if (req.url === '/watch') {
      res.end('<title>Video fixture</title><video controls loop src="/tone.webm"></video>')
    } else {
      // localhost is a different site from 127.0.0.1, so following this link leaves the saved site.
      res.end(
        `<title>Ideas</title><a id="leave" href="http://localhost:${port}/elsewhere">Leave</a>`
      )
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  videoUrl = `http://127.0.0.1:${port}/watch`
  ideasUrl = `http://127.0.0.1:${port}/ideas`

  root = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-links-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate((_electron, fixture) => {
    const e2e = (
      globalThis as unknown as {
        __e2e__: { createAdminWindow(): void; setVideoFixtureForTests(url: string): void }
      }
    ).__e2e__
    // The fixture stands in for a YouTube video, which is what gets the large controls.
    e2e.setVideoFixtureForTests(fixture)
    e2e.createAdminWindow()
  }, videoUrl)
  admin = await opened
  admin.on('pageerror', (error) => errors.push(error.message))
  admin.on('dialog', (dialog) => void dialog.accept())
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  // Through the Tiles tab, so admin's own copy of the config knows the tile is there.
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('knitting')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Knitting', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Videos and ideas' })).toBeVisible()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    server?.close()
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('saved links reach a shelf that is already open', async () => {
  await openShelf()
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await expect(card('links')).toHaveCount(0)
  await expect(linkList().getByRole('listitem')).toHaveText(['No videos or ideas yet.'])

  // A wrong address is refused in plain words, and nothing reaches her shelf.
  await admin.getByLabel('Name she sees').fill('Cable video')
  await admin.getByLabel('Address', { exact: true }).fill('ftp://example.org/cables')
  await admin.getByRole('button', { name: 'Add to her shelf', exact: true }).click()
  await expect(admin.getByRole('alert')).toHaveText(
    'Enter a complete http:// or https:// address without a username or password.'
  )
  await expect(card('links')).toHaveCount(0)

  await addLink('Cable video', videoUrl)
  await expect(card('links')).toHaveAccessibleName('Videos and ideas: Cable video')
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toHaveCount(0)
  await addLink('Stitch ideas', ideasUrl)
  await expect(card('links')).toHaveAccessibleName('Videos and ideas: 2 to choose from')
  await expect(linkList().getByRole('listitem')).toHaveText([
    'Cable video · 127.0.0.1Move earlierMove laterRemove',
    'Stitch ideas · 127.0.0.1Move earlierMove laterRemove'
  ])

  // The order the caregiver sets is the order she sees.
  await linkList().getByRole('button', { name: 'Move Stitch ideas earlier' }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Order saved.' })).toBeVisible()
  await card('links').click()
  await expect(page.getByRole('heading', { name: 'Videos and ideas' })).toBeVisible()
  await expect(page.locator('[data-link-card]')).toHaveText([
    'Stitch ideasWebsite',
    'Cable videoWebsite'
  ])
  // The buttons' words stay inside them at every text size.
  const usual = await admin.evaluate(async () => (await window.admin.getConfig()).display.fontStep)
  for (const fontStep of [0, 1, 2, 3, 4, usual]) {
    await admin.evaluate(async (fontStep) => {
      const config = await window.admin.getConfig()
      await window.admin.setConfig({ display: { ...config.display, fontStep } })
    }, fontStep)
    await expect
      .poll(() =>
        page
          .locator('[data-link-card]')
          .evaluateAll((buttons) =>
            buttons.every(
              (el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
            )
          )
      )
      .toBe(true)
    if (fontStep === 4)
      await page.screenshot({ path: test.info().outputPath('knitting-links-list-large.png') })
  }
  await page.getByRole('button', { name: 'Back to Knitting', exact: true }).click()
  await expect(card('links')).toBeVisible()
})

test('a saved video opens with the large playback controls, and Home closes it', async () => {
  await card('links').click()
  await page.getByRole('button', { name: 'Cable video: website', exact: true }).click()
  await expect.poll(viewUrl).toBe(videoUrl)
  await expect.poll(viewVisible).toBe(true)
  await expect(shelf()).toHaveCount(0)
  const toolbar = page.getByRole('toolbar', { name: 'Video controls' })
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '▶ Play', exact: true }).click()
  await expect(toolbar.getByRole('button', { name: 'Ⅱ Pause' })).toBeVisible()
  await home().click()
  await expect.poll(viewVisible).not.toBe(true)
  await expect(page.getByRole('button', { name: 'Knitting', exact: true })).toBeVisible()
})

test('a link leaving a saved website is blocked, and Back to the page returns', async () => {
  await openShelf()
  await card('links').click()
  await page.getByRole('button', { name: 'Stitch ideas: website', exact: true }).click()
  await expect.poll(viewUrl).toBe(ideasUrl)
  await app.evaluate(({ webContents }, target) => {
    const contents = webContents.getAllWebContents().find((w) => w.getURL() === target)!
    return contents.executeJavaScript("document.getElementById('leave').click()", true)
  }, ideasUrl)
  await expect(recovery()).toBeVisible()
  await expect.poll(viewVisible).toBe(false)
  await expect
    .poll(() => admin.evaluate(() => window.admin.getBlockedSites()))
    .toContain('localhost')
  await page.getByRole('button', { name: 'Back to the page', exact: true }).click()
  await expect.poll(viewVisible).toBe(true)
  await expect.poll(viewUrl).toBe(ideasUrl)
  await home().click()
  await expect(page.getByRole('button', { name: 'Knitting', exact: true })).toBeVisible()
})

test('one link left opens straight away; removing the last blocks its site again', async () => {
  await removeLink('Cable video')
  await openShelf()
  await expect(card('links')).toHaveAccessibleName('Videos and ideas: Stitch ideas')
  await card('links').click()
  await expect.poll(viewUrl).toBe(ideasUrl)
  await expect.poll(viewVisible).toBe(true)
  await home().click()

  await removeLink('Stitch ideas')
  await openShelf()
  await expect(card('links')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click()
  await page.evaluate((url) => window.launcher.openBrowser(url), ideasUrl)
  await expect
    .poll(() => admin.evaluate(() => window.admin.getBlockedSites()))
    .toContain('127.0.0.1')
  expect(await viewVisible()).toBe(false)
  await page.evaluate(() => window.launcher.goHome())
})

test('with all five parts, the four cards keep their places and the fifth runs underneath', async () => {
  await admin.getByLabel('What she is making').fill('Scarf')
  await admin.getByRole('button', { name: 'Save project', exact: true }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Project saved.' })).toBeVisible()
  await pickNext('page1.png')
  await admin.getByLabel('Pattern name').fill('Cable scarf')
  await admin.getByRole('button', { name: 'Choose page pictures…' }).click()
  await expect(
    admin.getByRole('status').filter({ hasText: 'Pattern saved with 1 page.' })
  ).toBeVisible()
  await pickNext('mittens.png')
  await admin.getByLabel('What it is').fill('Mittens')
  await admin.getByRole('button', { name: 'Choose a photo…' }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Piece saved.' })).toBeVisible()
  await admin.getByLabel('Show Ravelry on her Knitting shelf').check()
  await expect(admin.getByText('Ravelry is on her Knitting shelf.')).toBeVisible()

  await openShelf()
  const four = ['project', 'patterns', 'gallery', 'ravelry']
  for (const name of four) await expect(card(name)).toBeVisible()
  // Layout boxes, not screen boxes: a card lifts a little under the mouse, wherever that is.
  const place = (name: string): Promise<{ x: number; y: number; width: number; height: number }> =>
    card(name).evaluate((el: HTMLElement) => ({
      x: el.offsetLeft,
      y: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight
    }))
  const before = await Promise.all(four.map(place))

  await addLink('Cable video', videoUrl)
  await expect(card('links')).toBeVisible()
  const after = await Promise.all(four.map(place))
  for (const [index, box] of after.entries()) {
    // The same column at the same width, only a little shorter.
    expect(box.x).toBe(before[index]!.x)
    expect(box.width).toBe(before[index]!.width)
    expect(box.height).toBeLessThan(before[index]!.height)
  }
  const [project, patterns, gallery, ravelry] = after
  // The same rows: the top row stays put, and the bottom row is still the row under it.
  expect(project!.y).toBe(before[0]!.y)
  expect(patterns!.y).toBe(before[1]!.y)
  expect(gallery!.y).toBe(ravelry!.y)
  expect(gallery!.y).toBeGreaterThan(project!.y + project!.height)
  const bar = await place('links')
  expect(bar.x).toBe(project!.x)
  expect(bar.x + bar.width).toBe(patterns!.x + patterns!.width)
  expect(bar.y).toBeGreaterThan(gallery!.y + gallery!.height)

  // Every card's words stay inside it at every text size.
  for (let step = 0; step < 5; step++) {
    await admin.evaluate(async (fontStep) => {
      const config = await window.admin.getConfig()
      await window.admin.setConfig({ display: { ...config.display, fontStep } })
    }, step)
    for (const name of [...four, 'links']) {
      await expect
        .poll(
          () =>
            card(name).evaluate(
              (el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
            ),
          { message: `${name} card at text size ${step}` }
        )
        .toBe(true)
    }
    await page.screenshot({ path: test.info().outputPath(`knitting-links-shelf-${step}.png`) })
  }
  expect(errors).toEqual([])
})
