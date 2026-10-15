import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

let app: ElectronApplication
let page: Page
let root: string

test.describe.configure({ mode: 'serial' })

const veil = (): ReturnType<Page['locator']> => page.locator('[data-idle-dimmed]')
const albums = (): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: 'Family Albums', exact: true })

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-idle-dim-'))
  const config = defaultConfig()
  config.display.homeLayout = 'simple4'
  config.display.idleDim = { enabled: true, afterMinutes: 10, level: 0.4 }
  config.buddy.motion = 'still'
  config.tiles = [
    {
      id: 'albums',
      label: 'Family Albums',
      type: 'builtin',
      builtinKey: 'photos',
      size: 'normal',
      slot: 0,
      colorIndex: 0
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
  await expect(albums()).toBeVisible()
  // Minutes of idleness, without waiting minutes: Playwright's clock drives Date and timers.
  await page.clock.install()
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('Home stays bright until the chosen idle time, then dims gently', async () => {
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.clock.fastForward('09:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.clock.fastForward('01:30')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
  await expect(veil()).toHaveCSS('opacity', '0.4')
  // The veil never takes input itself; useIdleDim decides what the wake-up tap does.
  await expect(veil()).toHaveCSS('pointer-events', 'none')
})

test('the wake-up tap only brightens the screen and opens nothing', async () => {
  await albums().click()
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await expect(page.getByRole('dialog', { name: 'Family Albums', exact: true })).toHaveCount(0)
  // The next tap is an ordinary tap again.
  await albums().click()
  await expect(page.getByRole('dialog', { name: 'Family Albums', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(albums()).toBeVisible()
})

test('a key wakes it too, and the idle time starts again', async () => {
  await page.clock.fastForward('10:30')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
  await page.keyboard.press('Shift')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.clock.fastForward('05:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
})

test('a scroll wakes it as well', async () => {
  await page.clock.fastForward('10:30')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
  await page.mouse.move(400, 400)
  await page.mouse.wheel(0, 120)
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
})

test('never dims while a voice, listening or narration holds the sound', async () => {
  // The same hold Buddy's voice takes through the audio coordinator.
  const id = '9b1f4c2e-5a6d-4e7f-8a9b-0c1d2e3f4a5b'
  await page.evaluate(
    (holdId) => window.launcher.audioEvent({ type: 'start', source: 'narration', id: holdId }),
    id
  )
  await page.clock.fastForward('30:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.evaluate((holdId) => window.launcher.audioEvent({ type: 'end', id: holdId }), id)
  // The time it was in use doesn't count as idle: no dimming straight after.
  await page.clock.fastForward('02:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.clock.fastForward('09:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
  await page.keyboard.press('Shift')
})

test("never dims while Buddy's chat is open", async () => {
  await page.getByRole('button', { name: 'Say hello to Buddy', exact: true }).focus()
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('menuitem', { name: "Let's chat" }).click()
  await expect(page.getByRole('button', { name: 'Close chat' })).toBeVisible()
  await page.clock.fastForward('30:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.getByRole('button', { name: 'Close chat' }).click()
  // Time spent chatting was use: closing it restarts the idle time instead of dimming at once.
  await page.clock.fastForward('02:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
})

test('the caregiver switch turns it off at once, and reaches Home live', async () => {
  await page.clock.fastForward('10:30')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'true')
  const adminWindow = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  const admin = await adminWindow
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN' }).click()
  await admin.getByRole('button', { name: 'Display', exact: true }).click()
  const toggle = admin.getByLabel('Dim Home gently when nobody has used it for a while')
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.display.idleDim)))
    .toEqual({ enabled: false, afterMinutes: 10, level: 0.4 })
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
  await page.clock.fastForward('30:00')
  await expect(veil()).toHaveAttribute('data-idle-dimmed', 'false')
})
