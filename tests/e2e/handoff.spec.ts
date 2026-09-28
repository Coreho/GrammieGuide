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
let url: string

// These flows share one installed profile, like the existing kiosk smoke suite.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Family website</title><h1>Hello from the family</h1>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-handoff-'))}`],
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
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

test('commands require admin unlock and reject invalid clips', async () => {
  const locked = await admin.evaluate(async () => {
    try {
      await window.admin.commandBuddy({ clip: 'wave' })
      return false
    } catch {
      return true
    }
  })
  expect(locked).toBe(true)
  await admin.getByPlaceholder('4-8 digit PIN').fill('1357')
  await admin.getByPlaceholder('Confirm PIN').fill('1357')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
  const invalid = await admin.evaluate(() =>
    window.admin.commandBuddy({ clip: 'missing' } as never)
  )
  expect(invalid.ok).toBe(false)
})

test('caregiver adds, edits, reorders and removes tiles; web tile opens a local site', async () => {
  await admin.getByLabel('Tile label').fill('Family')
  await admin.getByLabel('Website address').fill(url)
  await admin.getByRole('button', { name: 'Icon 👪', exact: true }).click()
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Family', exact: true })).toBeVisible()
  await admin.getByLabel('Tile label').fill('Weather')
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Weather', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Edit Family', exact: true }).click()
  await admin.getByLabel('Tile label').fill('Family photos')
  await admin.getByLabel('Tile size').selectOption('wide')
  await admin.getByRole('button', { name: 'Save tile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Family photos', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Move Weather up', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.launcher.getConfig().then((c) => c.tiles.map((t) => t.label)))
    )
    .toEqual(['Weather', 'Family photos'])
  await page.reload()
  const tile = page.getByRole('button', { name: 'Family photos', exact: true })
  await expect(tile).toHaveCSS('grid-column-start', 'span 2')
  await tile.click()
  await expect(page.getByRole('button', { name: '🏠 Home' })).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home' }).focus()
  await page.keyboard.press('Control+Shift+B')
  await expect(page.getByRole('menu', { name: 'Buddy menu' })).toHaveCount(0)
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()))
    )
    .toContain(`${url}/`)
  await page.getByRole('button', { name: '🏠 Home' }).click()
  await page.getByRole('button', { name: 'Weather', exact: true }).click()
  await page.keyboard.press('Control+Shift+B')
  await expect(page.getByRole('menu', { name: 'Buddy menu' })).toHaveCount(0)
  await page.mouse.click(10, 10)
  await admin.getByRole('button', { name: 'Remove Weather', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Weather', exact: true })).toHaveCount(0)
})

test('Home menu uses the shortcut, restores focus, and performs commands', async () => {
  const floor = page.locator('[data-buddy-activity]')
  const buddy = page.getByRole('button', { name: 'Say hello to Buddy' })
  const menu = page.getByRole('menu', { name: 'Buddy menu' })
  await buddy.focus()
  await page.keyboard.press('Control+Shift+B')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: "Let's chat" })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(menu.getByRole('menuitem', { name: 'Take a walk' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu.getByRole('menuitem', { name: "Let's chat" })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(menu.getByRole('menuitem', { name: 'Take a walk' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: "Let's chat" })).toBeFocused()
  const card = await menu.boundingBox()
  const hit = await buddy.boundingBox()
  expect(card!.y + card!.height).toBeLessThanOrEqual(hit!.y)
  expect(card!.x).toBeGreaterThanOrEqual(0)
  expect(card!.x + card!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(buddy).toBeFocused()
  // Auto-repeat must not toggle the card away while B is held.
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.down('B')
  await page.keyboard.down('B')
  await expect(menu).toBeVisible()
  await page.keyboard.up('B')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await page.keyboard.press('Control+Shift+B')
  await expect(menu).toHaveCount(0)
  await page.keyboard.press('Control+Shift+B')
  await page.mouse.click(10, 10)
  await expect(menu).toHaveCount(0)
  await page.keyboard.press('Control+Shift+B')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  await expect(floor).toHaveAttribute('data-buddy-clip', 'dance')
  await page.keyboard.press('Control+Shift+B')
  await menu.getByRole('menuitem', { name: 'Say something nice', exact: true }).click()
  await expect(floor.getByRole('status')).toHaveText("I'm happy to spend some time with you.")
  await page.keyboard.press('Control+Shift+B')
  await menu.getByRole('menuitem', { name: 'Take a walk' }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'strolling')
  await page.keyboard.press('Control+Shift+B')
  await menu.getByRole('menuitem', { name: "Let's chat", exact: true }).click()
  await expect(page.getByPlaceholder('Say something...')).toBeVisible()
  await admin.evaluate(() =>
    window.admin.commandBuddy({ clip: 'dance', text: 'Should not interrupt' })
  )
  await expect(floor).toHaveAttribute('data-buddy-activity', /^chat\./)
  await expect(page.getByText('Should not interrupt')).toHaveCount(0)
  await buddy.click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'chat.petted')
  await page.getByRole('button', { name: 'Close chat' }).click()
})

test('taps react without a menu, respect read-aloud, and replace rapid reactions', async () => {
  const originalBuddy = await admin.evaluate(() => window.admin.getConfig().then((c) => c.buddy))
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({
      buddy: { ...config.buddy, voiceEnabled: false, cloudTtsEnabled: false, roaming: false }
    })
  })
  // Reload ensures the renderer has the saved settings before the first tap.
  await page.reload()
  await page.evaluate(() => {
    window.speechSynthesis.speak = (utterance): void => {
      document.body.dataset.testTapSpoken = utterance.text
      queueMicrotask(() => utterance.dispatchEvent(new Event('end')))
    }
  })
  const buddy = page.getByRole('button', { name: 'Say hello to Buddy' })
  const floor = page.locator('[data-buddy-activity]')
  await buddy.click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  const firstLine = await floor.getByRole('status').textContent()
  const firstClip = await floor.getAttribute('data-buddy-clip')
  await buddy.click()
  await expect(floor.getByRole('status')).not.toHaveText(firstLine!)
  await expect(floor).not.toHaveAttribute('data-buddy-clip', firstClip!)
  await expect(page.getByRole('menu', { name: 'Buddy menu' })).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveAttribute('data-test-tap-spoken')
  await buddy.click({ clickCount: 22, delay: 10 })
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  await expect(page.getByRole('heading', { name: "Let's take a breath" })).toHaveCount(0)
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({ buddy: { ...config.buddy, voiceEnabled: true } })
  })
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.voiceEnabled)))
    .toBe(true)
  await buddy.click()
  const spoken = await floor.getByRole('status').textContent()
  await expect(page.locator('body')).toHaveAttribute('data-test-tap-spoken', spoken!)
  await admin.evaluate((buddy) => window.admin.setConfig({ buddy }), originalBuddy)
})

test('caregiver commands and quick messages persist without logging their content', async () => {
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await admin.getByLabel(/Use the natural online voice/).uncheck()
  // Observe the Windows fallback boundary without requiring speakers or a network voice.
  await page.evaluate(() => {
    window.speechSynthesis.speak = (utterance): void => {
      document.body.dataset.testSpoken = utterance.text
      queueMicrotask(() => utterance.dispatchEvent(new Event('end')))
    }
  })
  await expect(admin.getByRole('group', { name: 'Animations' }).getByRole('button')).toHaveCount(25)
  await admin.getByLabel('Say this').fill('A private greeting for you')
  await admin.getByLabel('Gesture', { exact: true }).selectOption('dance')
  await admin.getByLabel('Read this message aloud').check()
  await admin.getByRole('button', { name: 'Save quick message' }).click()
  await expect(
    admin.getByRole('listitem').filter({ hasText: 'A private greeting for you' })
  ).toBeVisible()
  await admin.getByRole('button', { name: 'Tiles', exact: true }).click()
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await admin.getByRole('button', { name: 'Say message', exact: true }).click()
  const floor = page.locator('[data-buddy-activity]')
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  await expect(floor.getByRole('status')).toHaveText('A private greeting for you')
  await expect(page.locator('body')).toHaveAttribute(
    'data-test-spoken',
    'A private greeting for you'
  )
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(JSON.stringify(log)).not.toContain('A private greeting for you')
  await page.screenshot({ path: 'test-results/handoff-buddy-command.png' })
  await admin.getByRole('button', { name: 'Remove message', exact: true }).click()
  await expect(admin.getByText('No saved messages yet.')).toBeVisible()
})

test('5–8 tiles retain complete labels and the 150px footer at the largest text size', async () => {
  for (const count of [5, 6, 7, 8]) {
    await admin.evaluate(
      async ({ count, url }) => {
        const config = await window.admin.getConfig()
        await window.admin.setConfig({
          display: { ...config.display, fontStep: 4 },
          tiles: Array.from({ length: count }, (_, i) => ({
            id: `layout-${i}`,
            type: 'web',
            size: i === 0 ? 'wide' : 'normal',
            label:
              i === 0
                ? 'Family photos and happy memories together'
                : [
                    'Local weather',
                    'Favorite music',
                    'Word games',
                    'Daily news',
                    'Family videos',
                    'Garden photos',
                    'Favorite books'
                  ][i - 1]!,
            icon: '🌷',
            url
          }))
        })
      },
      { count, url }
    )
    const grid = page.getByRole('main', { name: 'Home tiles' })
    await expect(grid.getByRole('button')).toHaveCount(count)
    const layout = await grid.evaluate((el) => {
      const buttons = Array.from(el.querySelectorAll('button'))
      return {
        footerHeight: document.querySelector('footer')!.offsetHeight,
        floorWidth: (document.querySelector('[data-buddy-floor]') as HTMLElement).offsetWidth,
        tiles: buttons.map((button) => ({
          height: button.offsetHeight,
          unclipped: button.scrollHeight <= button.clientHeight + 1,
          clamp: getComputedStyle(button.lastElementChild!).webkitLineClamp
        }))
      }
    })
    expect(layout.footerHeight).toBe(150)
    expect(layout.floorWidth).toBe(1440)
    for (const tile of layout.tiles) {
      expect(tile.height).toBeGreaterThanOrEqual(150)
      expect(tile.unclipped).toBe(true)
      expect(tile.clamp).toBe('none')
    }
  }
  await page.screenshot({ path: 'test-results/handoff-eight-tiles.png' })
})

test('daytime roaming reaches the left footer and text controls stay usable; night stays still', async () => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    Math.random = () => 0.05
  })
  await page.clock.install({ time: new Date(2026, 8, 26, 14, 0) })
  await page.clock.resume()
  await page.reload()
  const floor = page.locator('[data-buddy-activity]')
  await expect(floor.locator('canvas')).toBeVisible()
  await page.clock.runFor(70_000)
  await expect(floor).toHaveAttribute('data-buddy-target', /^0\.10/)
  await page.clock.runFor(35_000)
  const hit = await page.getByRole('button', { name: 'Say hello to Buddy' }).boundingBox()
  const smaller = await page.getByRole('button', { name: 'Make text smaller' }).boundingBox()
  expect(hit!.x).toBeLessThan(smaller!.x + 200)
  await page.keyboard.press('Control+Shift+B')
  const leftMenu = await page.getByRole('menu', { name: 'Buddy menu' }).boundingBox()
  expect(leftMenu!.x).toBeGreaterThanOrEqual(0)
  expect(leftMenu!.y).toBeGreaterThanOrEqual(0)
  expect(leftMenu!.y + leftMenu!.height).toBeLessThanOrEqual(hit!.y)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Make text smaller' }).click()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.display.fontStep)))
    .toBe(3)
  await page.screenshot({ path: 'test-results/handoff-left-roaming.png' })
  await page.clock.setFixedTime(new Date(2026, 8, 26, 23, 0))
  await page.reload()
  await expect(floor).toBeVisible()
  await page.clock.fastForward(180_000)
  await expect(floor).toHaveAttribute('data-buddy-target', '0.78')
  await admin.evaluate(() =>
    window.admin.commandBuddy({ clip: 'dance', text: 'A deliberate nighttime greeting' })
  )
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
  await expect(floor.getByRole('status')).toHaveText('A deliberate nighttime greeting')
})
