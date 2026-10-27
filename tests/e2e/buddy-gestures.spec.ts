import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * TASK-68: she can ask Buddy for a gesture in chat, with no ChatGPT
 * connection, and he performs it without the chat closing. TASK-70: a tap on
 * Home makes him glance that way (the screenshots are for a human eye; the
 * angle itself is unit tested).
 */

let app: ElectronApplication
let page: Page
const problems: string[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-e2e-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(e.message))
  await page.waitForLoadState('domcontentloaded')
  // An afternoon, so no morning stretch gets in the way.
  await page.clock.install({ time: new Date(2026, 8, 30, 14, 0) })
  await page.reload()
})

test.afterAll(async () => {
  await app.close()
})

test('asking Buddy to dance plays the dance in chat, without a connection', async () => {
  const floor = page.locator('[data-buddy-activity]')
  await expect(page.getByRole('button', { name: 'Say hello to Buddy' })).toBeVisible()
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('menuitem', { name: "Let's chat" }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', /^chat\./)

  await page.getByPlaceholder('Say something...').fill('Buddy, dance for me')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText("Here's a little dance for you!")).toBeVisible()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'chat.gesturing')
  await expect(floor).toHaveAttribute('data-buddy-clip', /^(?:dance|groove|funny_dance)$/)
  await expect(page.getByPlaceholder('Say something...')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/buddy-gesture-dance.png' })

  // Ordinary talk about dancing is not a request.
  await expect(floor).not.toHaveAttribute('data-buddy-activity', 'chat.gesturing', {
    timeout: 21_000
  })
  await page.getByPlaceholder('Say something...').fill('I used to dance with my husband')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(/talking isn't switched on yet/)).toBeVisible()
  await expect(floor).not.toHaveAttribute('data-buddy-activity', 'chat.gesturing')
  await page.getByRole('button', { name: 'Close chat' }).click()
  expect(problems).toEqual([])
})

test('a tap on Home makes him glance toward it', async () => {
  const floor = page.locator('[data-buddy-activity]')
  await expect(floor).not.toHaveAttribute('data-buddy-activity', 'farewell', { timeout: 21_000 })
  const box = (await floor.boundingBox())!
  const clip = { x: 0, y: box.y - 120, width: box.x + box.width, height: box.height + 120 }
  await page.screenshot({ path: 'test-results/buddy-glance-before.png', clip })
  // The clock in the header: a tap that opens nothing, far to his left.
  await page.mouse.click(40, 60)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'test-results/buddy-glance-left.png', clip })
  expect(problems).toEqual([])
})
