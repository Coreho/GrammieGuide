import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RAVELRY = 'https://www.ravelry.com/'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
test.describe.configure({ mode: 'serial' })

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Every https request in her browser's session gets this page, so no test reaches the real site.
  await app.evaluate(({ session }) => {
    session
      .fromPartition('persist:web')
      .protocol.handle(
        'https',
        () =>
          new Response(
            '<!doctype html><title>Stand-in</title><a id="leave" href="https://www.example.com/">Leave</a>',
            { headers: { 'content-type': 'text/html' } }
          )
      )
  })
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  admin.on('dialog', (dialog) => void dialog.accept())
  await admin.waitForLoadState('domcontentloaded')
}

const shelf = (): ReturnType<Page['getByRole']> => page.getByRole('dialog', { name: 'Knitting' })
const card = (): ReturnType<Page['locator']> => shelf().locator('[data-knitting-card="ravelry"]')
const toggle = (): ReturnType<Page['getByLabel']> =>
  admin.getByLabel('Show Ravelry on her Knitting shelf')
const recovery = (): ReturnType<Page['getByRole']> =>
  page.getByRole('alert', { name: "That page can't be opened here." })
const home = (): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: '🏠 Home', exact: true }).first()

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

async function knittingTab(): Promise<void> {
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Ravelry', exact: true })).toBeVisible()
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

/** Home asking for the page directly is refused: only the caregiver's switch approves the site. */
async function expectBlocked(): Promise<void> {
  await page.evaluate((url) => window.launcher.openBrowser(url), RAVELRY)
  await expect
    .poll(() => admin.evaluate(() => window.admin.getBlockedSites()))
    .toContain('www.ravelry.com')
  expect(await viewUrl()).not.toBe(RAVELRY)
  expect(await viewVisible()).toBe(false)
  await page.evaluate(() => window.launcher.goHome())
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-ravelry-'))
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('the switch waits for a Knitting tile, and Ravelry stays blocked while it is off', async () => {
  await knittingTab()
  await expect(toggle()).toBeDisabled()
  await expect(admin.getByText('Add a Knitting tile in the Tiles tab first.')).toBeVisible()

  await admin.getByRole('button', { name: 'Tiles', exact: true }).click()
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('knitting')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  await openShelf()
  await expect(card()).toHaveCount(0)
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toBeVisible()
  await shelf().getByRole('button', { name: 'Back to Home', exact: true }).click()

  await expectBlocked()
})

test('turning it on reaches a shelf that is already open, and the card opens Ravelry', async () => {
  await knittingTab()
  await expect(toggle()).toBeEnabled()
  await expect(toggle()).not.toBeChecked()
  await openShelf()
  await expect(card()).toHaveCount(0)

  await toggle().check()
  await expect(toggle()).toBeChecked()
  await expect(admin.getByText('Ravelry is on her Knitting shelf.')).toBeVisible()
  await expect(card()).toBeVisible()
  await expect(card()).toHaveAccessibleName('Ravelry: patterns and ideas online')
  await expect(
    shelf().getByText('Your knitting will be here once your family sets it up.')
  ).toHaveCount(0)

  await card().click()
  await expect.poll(viewUrl).toBe(RAVELRY)
  await expect.poll(viewVisible).toBe(true)
  await expect(shelf()).toHaveCount(0)
  await expect(home()).toBeVisible()
})

test('a link leaving Ravelry is blocked and the page comes back', async () => {
  await app.evaluate(({ webContents }, target) => {
    const contents = webContents.getAllWebContents().find((w) => w.getURL() === target)!
    return contents.executeJavaScript("document.getElementById('leave').click()", true)
  }, RAVELRY)
  await expect(recovery()).toBeVisible()
  await expect.poll(viewVisible).toBe(false)
  await page.getByRole('button', { name: 'Back to the page', exact: true }).click()
  await expect.poll(viewVisible).toBe(true)
  await expect.poll(viewUrl).toBe(RAVELRY)
  await home().click()
  await expect(page.getByRole('button', { name: 'Knitting', exact: true })).toBeVisible()
})

test('the switch survives a restart, and the card survives an unreadable knitting file', async () => {
  await app.close()
  await launch()
  await admin.getByPlaceholder('Enter PIN', { exact: true }).fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
  await knittingTab()
  await expect(toggle()).toBeChecked()

  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('knitting:home')
    ipcMain.handle('knitting:home', () => {
      throw new Error('stand-in failure')
    })
  })
  await openShelf()
  await expect(shelf().getByText("Your knitting isn't ready right now.")).toBeVisible()
  await expect(card()).toBeVisible()
})

test('turning it off removes the card and the site at once', async () => {
  await toggle().uncheck()
  await expect(toggle()).not.toBeChecked()
  await expect(admin.getByText('Ravelry is off her Knitting shelf.')).toBeVisible()
  await expect(card()).toHaveCount(0)
  await shelf().getByRole('button', { name: 'Back to Home', exact: true }).click()
  await expectBlocked()
})

test('a refused open keeps her on the shelf with a calm line', async () => {
  await toggle().check()
  await expect(admin.getByText('Ravelry is on her Knitting shelf.')).toBeVisible()
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('browser:open')
    ipcMain.handle('browser:open', () => ({ ok: false }))
  })
  await openShelf()
  await card().click()
  await expect(
    shelf().getByRole('status').filter({ hasText: "Ravelry can't open right now." })
  ).toBeVisible()
  await expect(card()).toBeEnabled()
})
