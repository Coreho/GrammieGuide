import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const READ_NAME = 'read-e2e-username'
const READ_KEY = 'e2e-sekret-password'
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
// A public address written as a number, so the image guard needs no DNS and the fetch stand-in answers.
const PICTURE = 'https://93.184.216.34/photo'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
test.describe.configure({ mode: 'serial' })

const SEARCH = {
  patterns: [
    {
      id: 1001,
      name: 'Garter Baby Blanket',
      pattern_author: { name: 'Ann Example' },
      first_photo: { small_url: `${PICTURE}-small.jpg` }
    },
    { id: 1002, name: 'Lace Scarf', pattern_author: { name: 'Bea Example' }, first_photo: null }
  ]
}
const PATTERN = {
  pattern: {
    id: 1001,
    name: 'Garter Baby Blanket',
    pattern_author: { name: 'Ann Example' },
    notes_html:
      '<p>A <strong>simple</strong> blanket.<img src="https://93.184.216.34/tracker.gif" onerror="window.__hacked=1"></p><script>window.__hacked=1</script>',
    yarn_weight_description: 'DK',
    pattern_needle_sizes: [{ name: 'US 7 - 4.5 mm' }],
    photos: [{ medium2_url: `${PICTURE}-1.jpg` }, { medium2_url: `${PICTURE}-2.jpg` }]
  }
}

/** Stands in for Ravelry in main's fetch; anything else would be a test reaching the real site. */
async function standInForRavelry(mode: 'ok' | 'down'): Promise<void> {
  await app.evaluate(
    (_electron, { mode, search, pattern, png, name, key }) => {
      const stand = globalThis as unknown as {
        __ravelryHosts?: string[]
        __ravelryRealFetch?: typeof fetch
      }
      stand.__ravelryRealFetch ??= globalThis.fetch
      stand.__ravelryHosts = []
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input))
        stand.__ravelryHosts!.push(url.host)
        if (mode === 'down') throw new TypeError('fetch failed')
        if (url.host === 'api.ravelry.com') {
          const auth = new Headers(init?.headers).get('authorization')
          const good = `Basic ${Buffer.from(`${name}:${key}`).toString('base64')}`
          if (auth !== good) return new Response('{}', { status: 403 })
          const body = url.pathname === '/patterns/search.json' ? search : pattern
          return new Response(JSON.stringify(body), {
            headers: { 'content-type': 'application/json' }
          })
        }
        if (url.host === '93.184.216.34') {
          return new Response(Buffer.from(png, 'base64'), {
            headers: { 'content-type': 'image/png' }
          })
        }
        throw new Error(`Unexpected request to ${url.host}`)
      }
    },
    { mode, search: SEARCH, pattern: PATTERN, png: PNG, name: READ_NAME, key: READ_KEY }
  )
}

async function launch(mode: 'ok' | 'down'): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await standInForRavelry(mode)
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
const ravelryCard = (): ReturnType<Page['locator']> =>
  shelf().locator('[data-knitting-card="ravelry"]')
const username = (): ReturnType<Page['getByLabel']> => admin.getByLabel('Username')
const password = (): ReturnType<Page['getByLabel']> => admin.getByLabel('Password')

async function knittingTab(): Promise<void> {
  await admin.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Patterns picked for her' })).toBeVisible()
}

async function openShelf(): Promise<void> {
  await page.getByRole('button', { name: 'Knitting', exact: true }).click()
  await expect(shelf()).toBeVisible()
}

async function enterKey(name: string, key: string): Promise<void> {
  await username().fill(name)
  await password().fill(key)
  await admin.getByRole('button', { name: 'Save key', exact: true }).click()
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-ravelry-api-'))
  await launch('ok')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('knitting')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
})

test.afterAll(async () => {
  await app?.close()
})

test('only a read-only key Ravelry accepts is saved, and it stays encrypted in main', async () => {
  await knittingTab()

  await enterKey('personal-access-key', 'personal-key-value')
  await expect(admin.getByRole('alert')).toContainText("That isn't a read-only key")
  await expect(username()).toBeVisible()
  expect(existsSync(join(root, 'ravelry-key.enc'))).toBe(false)

  await enterKey(READ_NAME, 'wrong-password')
  await expect(admin.getByRole('alert')).toContainText("Ravelry didn't accept that key")
  expect(existsSync(join(root, 'ravelry-key.enc'))).toBe(false)

  await enterKey(READ_NAME, READ_KEY)
  await expect(admin.getByText('The read-only key is saved.')).toBeVisible()
  await expect(username()).toHaveCount(0)
  await expect(admin.getByLabel('Look for')).toBeVisible()

  const saved = readFileSync(join(root, 'ravelry-key.enc'))
  expect(saved.includes(READ_KEY)).toBe(false)
  expect(saved.includes(READ_NAME)).toBe(false)
  const config = readFileSync(join(root, 'grammieguide-config.json'), 'utf8')
  expect(config).not.toContain(READ_KEY)
  expect(config).not.toContain(READ_NAME)
  expect(JSON.stringify(await admin.evaluate(() => window.admin.getRavelryStatus()))).toBe(
    '{"connected":true,"canSave":true}'
  )
})

test('the caregiver finds a pattern and adds it, with thumbnails that load', async () => {
  await admin.getByLabel('Look for').fill('blanket')
  await admin.getByRole('button', { name: 'Search', exact: true }).click()
  const results = admin.getByRole('list', { name: 'Ravelry results' })
  await expect(results.getByRole('listitem')).toHaveCount(2)
  await expect(results.getByText('Lace Scarf')).toBeVisible()
  await expect
    .poll(() =>
      results
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0)

  await results.getByRole('button', { name: 'Add Garter Baby Blanket to her shelf' }).click()
  await expect(admin.getByText('Added to her shelf.')).toBeVisible()
  await expect(
    results.getByRole('button', { name: 'Add Garter Baby Blanket to her shelf' })
  ).toHaveText('On her shelf')
  await expect(
    results.getByRole('button', { name: 'Add Garter Baby Blanket to her shelf' })
  ).toBeDisabled()
  await expect(
    admin.getByRole('list', { name: 'Patterns picked for her' }).getByText('Garter Baby Blanket')
  ).toBeVisible()
  expect(
    await app.evaluate(() => (globalThis as unknown as { __ravelryHosts: string[] }).__ravelryHosts)
  ).toEqual(expect.arrayContaining(['api.ravelry.com', '93.184.216.34']))
})

test('she opens it from her shelf as pictures and plain words, never remote markup', async () => {
  await openShelf()
  await expect(ravelryCard()).toHaveAccessibleName('Ravelry: Garter Baby Blanket')
  await ravelryCard().click()

  const card = shelf().getByRole('button', { name: 'Garter Baby Blanket, by Ann Example' })
  await expect(card).toBeVisible()
  await expect(shelf().locator('[data-ravelry-card="website"]')).toHaveCount(0)
  await card.click()

  await expect(shelf().getByRole('heading', { name: 'Garter Baby Blanket' })).toBeVisible()
  await expect(shelf().getByText('By Ann Example')).toBeVisible()
  await expect(shelf().getByText('US 7 - 4.5 mm')).toBeVisible()
  await expect(shelf().getByText('A simple blanket.')).toBeVisible()

  const words = shelf().locator('.knitting-ravelry-words')
  await expect(words.locator('img, script, strong')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __hacked?: number }).__hacked)).toBe(
    undefined
  )

  const picture = shelf().getByRole('img', { name: 'Garter Baby Blanket' })
  await expect(picture).toHaveAttribute('src', /^grammie-media:\/\/ravelry\//)
  await expect
    .poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await expect(shelf().getByText('1 of 2')).toBeVisible()
  await shelf().getByRole('button', { name: 'Next picture' }).click()
  await expect(shelf().getByText('2 of 2')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(card).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(ravelryCard()).toBeFocused()
})

test('with the website switched on, the list offers it last and the card still opens the list', async () => {
  await admin.getByLabel('Show Ravelry on her Knitting shelf').check()
  await expect(admin.getByText('Ravelry is on her Knitting shelf.')).toBeVisible()
  await ravelryCard().click()
  const website = shelf().locator('[data-ravelry-card="website"]')
  await expect(website).toBeVisible()
  await expect(website).toHaveAccessibleName('Ravelry website: patterns and ideas online')
  await shelf().getByRole('button', { name: 'Back to Knitting' }).click()
  await admin.getByLabel('Show Ravelry on her Knitting shelf').uncheck()
  await expect(admin.getByText('Ravelry is off her Knitting shelf.')).toBeVisible()
  await shelf().getByRole('button', { name: 'Back to Home', exact: true }).click()
})

test('with Ravelry unreachable after a restart she still has it, and only admin gets a calm line', async () => {
  await app.close()
  await launch('down')
  await admin.getByPlaceholder('Enter PIN', { exact: true }).fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()

  await openShelf()
  await ravelryCard().click()
  await shelf().getByRole('button', { name: 'Garter Baby Blanket, by Ann Example' }).click()
  await expect(shelf().getByText('A simple blanket.')).toBeVisible()
  const picture = shelf().getByRole('img', { name: 'Garter Baby Blanket' })
  await expect
    .poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  expect(
    await app.evaluate(() => (globalThis as unknown as { __ravelryHosts: string[] }).__ravelryHosts)
  ).toEqual([])

  await knittingTab()
  await admin.getByLabel('Look for').fill('scarf')
  await admin.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(admin.getByRole('alert')).toHaveText(
    "Ravelry can't be reached right now. Try again in a little while."
  )
})

test('a picture that has gone gets a calm line and keeps the words', async () => {
  const before = readdirSync(join(root, 'media', 'ravelry')).filter((name) => /\.jpg$/.test(name))
  expect(before.length).toBeGreaterThan(0)
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('knitting:home')
    ipcMain.handle('knitting:home', () => ({
      project: null,
      patterns: [],
      pieces: [],
      ravelry: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Lost pictures',
          designer: '',
          facts: [],
          notes: 'Words are still here.',
          pictures: [{}]
        }
      ]
    }))
  })
  await shelf().getByRole('button', { name: 'Back to Ravelry' }).click()
  await page.evaluate(() => window.location.reload())
  await page.waitForLoadState('domcontentloaded')
  await openShelf()
  await ravelryCard().click()
  await shelf().getByRole('button', { name: 'Lost pictures', exact: true }).click()
  await expect(shelf().getByText("This picture isn't ready right now.")).toBeVisible()
  await expect(shelf().getByText('Words are still here.')).toBeVisible()
  await shelf().getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('removing the key keeps her patterns; removing the pattern takes its pictures with it', async () => {
  await admin.getByRole('button', { name: 'Remove key', exact: true }).click()
  await expect(
    admin.getByText('The key is removed. Her saved patterns stay on her shelf.')
  ).toBeVisible()
  expect(existsSync(join(root, 'ravelry-key.enc'))).toBe(false)
  await expect(username()).toBeVisible()

  const picks = admin.getByRole('list', { name: 'Patterns picked for her' })
  await expect(picks.getByText('Garter Baby Blanket')).toBeVisible()
  await picks.getByRole('button', { name: 'Remove Ravelry pattern Garter Baby Blanket' }).click()
  await expect(admin.getByText('Removed from her shelf.')).toBeVisible()
  await expect(picks.getByText('No patterns picked yet.')).toBeVisible()
  await expect
    .poll(() => readdirSync(join(root, 'media', 'ravelry')).filter((name) => /\.jpg$/.test(name)))
    .toEqual([])
})
