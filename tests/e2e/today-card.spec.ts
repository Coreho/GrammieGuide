import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FONT_STEP_COUNT } from '../../src/shared/theme'

// TASK-79: the Today card on Home, from the caregiver's dated plans for Buddy.
let app: ElectronApplication
let home: Page
let admin: Page
let folder: string
const errors: string[] = []

/** Her local calendar date, `days` from today, as the plan form saves it. */
function localDay(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function plan(id: number, days: number, text: string, cancelled = false): object {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    kind: 'plan',
    text,
    date: localDay(days),
    cancelled
  }
}

async function firstTileBox(): Promise<{ y: number; height: number }> {
  const box = await home.locator('[data-tile-slot]').first().boundingBox()
  if (!box) throw new Error('no tile on Home')
  return { y: Math.round(box.y), height: Math.round(box.height) }
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'grammie-today-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  home = await app.firstWindow()
  home.on('pageerror', (error) => errors.push(error.message))
  await home.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate(() =>
    (
      globalThis as unknown as { __e2e__: { createAdminWindow(): void } }
    ).__e2e__.createAdminWindow()
  )
  admin = await opened
  admin.on('pageerror', (error) => errors.push(error.message))
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.evaluate(async () => {
    await window.admin.setConfig({
      tiles: [
        {
          id: 'a',
          label: 'Family',
          type: 'web',
          url: 'https://example.com',
          slot: 0,
          colorIndex: 0,
          size: 'normal'
        },
        {
          id: 'b',
          label: 'Garden',
          type: 'web',
          url: 'https://example.org',
          slot: 1,
          colorIndex: 1,
          size: 'normal'
        }
      ]
    })
  })
  await expect(home.locator('[data-tile-slot]')).toHaveCount(2)
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('the card is off until the caregiver turns it on in Display', async () => {
  await expect(home.locator('[data-today-card]')).toHaveCount(0)
  await admin.getByRole('button', { name: 'Display', exact: true }).click()
  await admin.locator('[data-setting="today-card"]').check()
  const card = home.locator('[data-today-card]')
  await expect(card).toBeVisible()
  await expect(card.locator('[data-today-line="today"]')).toHaveText(
    /Nothing written down for today\./
  )
  await expect(card.locator('[data-today-line="tomorrow"]')).toHaveText(/Nothing written down\./)
  // Admin's Home preview shows the same card.
  await expect(admin.locator('[data-home-preview] [data-today-card]')).toBeVisible()
})

test("today's and tomorrow's plans show; cancelled and past ones don't; tiles never move", async () => {
  const before = await firstTileBox()
  const facts = [
    plan(2, -1, 'Hair appointment'),
    plan(3, 0, 'Sarah visits at 3'),
    plan(4, 0, 'Doctor at 10', true),
    plan(5, 0, 'Lunch with Ann'),
    plan(6, 1, 'Tom phones in the evening'),
    plan(7, 5, 'Church supper')
  ]
  await admin.evaluate(async (list) => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({ buddy: { ...config.buddy, personalFacts: list as never } })
  }, facts)
  const card = home.locator('[data-today-card]')
  await expect(card.locator('[data-today-line="today"]')).toHaveText(
    'Today:Sarah visits at 3  ·  Lunch with Ann'
  )
  await expect(card.locator('[data-today-line="tomorrow"]')).toHaveText(
    'Tomorrow:Tom phones in the evening'
  )
  await expect(card).not.toContainText('Hair appointment')
  await expect(card).not.toContainText('Doctor')
  await expect(card).not.toContainText('Church')
  expect(await firstTileBox()).toEqual(before)
})

test('the tomorrow line can be switched off', async () => {
  await admin.locator('[data-setting="today-card-tomorrow"]').uncheck()
  await expect(home.locator('[data-today-line="tomorrow"]')).toHaveCount(0)
  await expect(home.locator('[data-today-line="today"]')).toContainText('Sarah visits at 3')
})

test('it fits at the largest text size without covering the tiles', async () => {
  const setFontStep = (step: number): Promise<number> =>
    admin.evaluate(async (next) => {
      const config = await window.admin.getConfig()
      await window.admin.setConfig({ display: { ...config.display, fontStep: next } })
      return config.display.fontStep
    }, step)
  const saved = await setFontStep(FONT_STEP_COUNT - 1)
  await expect(home.locator('[data-today-card]')).toBeVisible()
  const card = await home.locator('[data-today-card]').boundingBox()
  const tile = await home.locator('[data-tile-slot]').first().boundingBox()
  expect(card && tile).toBeTruthy()
  expect(card!.y + card!.height).toBeLessThanOrEqual(tile!.y)
  // The card keeps its fixed height; long plans shrink or clip rather than wrap.
  // Its height doesn't grow with her text size: long plans shrink or clip, never wrap.
  const height = await home
    .locator('[data-today-card]')
    .evaluate((el) => (el as HTMLElement).offsetHeight)
  expect(height).toBe(64)
  await home.screenshot({ path: test.info().outputPath('today-card-large-text.png') })
  await setFontStep(saved)
})

test('Buddy reads the card when she asks', async () => {
  const ask = (text: string): Promise<{ ok: boolean; reply: string }> =>
    home.evaluate((t) => window.launcher.buddyChat([{ role: 'user', text: t }]), text)
  const day = await ask('What day is it?')
  expect(day.ok).toBe(true)
  expect(day.reply).toMatch(/^It's \w+ (morning|afternoon|evening|night), \w+ \d+\.$/)
  const plans = await ask("What's on today?")
  expect(plans.reply).toMatch(/Written down for today: Sarah visits at 3, and Lunch with Ann\.$/)
  // The tomorrow line is off, so he doesn't mention it either.
  expect(plans.reply).not.toContain('Tom')
  const log = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog()))
  expect(log).toContain('buddy-today-plans')
  expect(log).not.toMatch(/Sarah|Lunch|Tom/)
})

test('turning it off gives Home back its full tile height', async () => {
  const withCard = await firstTileBox()
  await admin.locator('[data-setting="today-card"]').uncheck()
  await expect(home.locator('[data-today-card]')).toHaveCount(0)
  const without = await firstTileBox()
  expect(without.height).toBeGreaterThan(withCard.height)
  expect(errors).toEqual([])
})
