import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let admin: Page
const reviewDir = '.impeccable/review/games'
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  mkdirSync(reviewDir, { recursive: true })
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-games-e2e-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('built-in Games tile defaults to Games clay artwork and opens the Games hub', async () => {
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption('games')
  await expect(admin.getByLabel('Tile label')).toHaveValue('Games')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()

  const gamesTile = page.getByRole('button', { name: 'Games', exact: true })
  await expect(gamesTile).toBeVisible()
  await expect(gamesTile.locator('[data-builtin-artwork="games"]')).toBeVisible()

  await gamesTile.click()
  const dialog = page.getByRole('dialog', { name: 'Games' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Matching Pairs/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Picture Puzzle/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Tic-Tac-Toe/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Melody Chimes/ })).toBeVisible()
  await page.screenshot({ path: join(reviewDir, 'games-hub.png') })
})

test('all four built-in games operate without triggering rapid-tap confusion', async () => {
  // Lower rapid-tap threshold to 3 taps so unguarded taps would immediately open ConfusionOverlay
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({
      confusion: {
        ...config.confusion,
        rapidTap: { count: 3, windowMs: 5000, clusterRadiusPx: 300, cooldownMs: 1000 }
      }
    })
  })

  // 1. Matching Pairs
  await page.getByRole('button', { name: /Matching Pairs/ }).click()
  await expect(page.getByRole('heading', { name: 'Matching Pairs' })).toBeVisible()
  const card1 = page.getByRole('button', { name: 'Card 1' })
  await card1.click()
  await page.getByRole('button', { name: 'Card 2' }).click()
  await page.getByRole('button', { name: '8 Cards' }).click()
  await expect(page.locator('.matching-card')).toHaveCount(8)
  await page.screenshot({ path: join(reviewDir, 'games-matching.png') })
  await page.getByRole('button', { name: /Other games/ }).click()

  // 2. Picture Puzzle (Jigsaw & Rectangular Cards)
  await page.getByRole('button', { name: /Picture Puzzle/ }).click()
  await expect(page.getByRole('heading', { name: 'Picture Puzzle' })).toBeVisible()
  await expect(page.getByText('Opening Games...')).toHaveCount(0)
  await expect(page.getByLabel(/Picture Guide:/)).toBeVisible()
  await expect(page.locator('.puzzle-grid')).toHaveAttribute('data-style', 'jigsaw')
  await expect(page.locator('.puzzle-jigsaw-svg')).toHaveCount(4)
  const slot1 = page.locator('.puzzle-piece').nth(0)
  const slot2 = page.locator('.puzzle-piece').nth(1)
  await slot1.click()
  await expect(slot1).toHaveAttribute('data-selected', 'true')
  await slot2.click()
  await expect(slot1).toHaveAttribute('data-selected', 'false')
  await page.getByRole('button', { name: '6 Pieces' }).click()
  await expect(page.locator('.puzzle-piece')).toHaveCount(6)
  await page.screenshot({ path: join(reviewDir, 'games-puzzle.png') })

  // Switch to Rectangular Cards mode and verify
  await page.getByRole('button', { name: 'Cards', exact: true }).click()
  await expect(page.locator('.puzzle-grid')).toHaveAttribute('data-style', 'cards')
  await page.screenshot({ path: join(reviewDir, 'games-puzzle-cards.png') })
  await page.getByRole('button', { name: 'Jigsaw', exact: true }).click()
  await expect(page.locator('.puzzle-grid')).toHaveAttribute('data-style', 'jigsaw')
  await page.getByRole('button', { name: /Other games/ }).click()

  // 3. Tic-Tac-Toe
  await page.getByRole('button', { name: /Tic-Tac-Toe/ }).click()
  await expect(page.getByRole('heading', { name: 'Tic-Tac-Toe' })).toBeVisible()
  const firstSquare = page.locator('.ttt-cell').first()
  await firstSquare.click()
  await expect(firstSquare).toHaveAttribute('aria-label', /Sun/)
  await page.screenshot({ path: join(reviewDir, 'games-tictactoe.png') })
  await page.getByRole('button', { name: /Other games/ }).click()

  // 4. Melody Chimes — tap the same pad 5 times rapidly to verify confusion exclusion
  await page.getByRole('button', { name: /Melody Chimes/ }).click()
  await expect(page.getByRole('heading', { name: 'Melody Chimes' })).toBeVisible()
  const firstPad = page.locator('.melody-pad').first()
  for (let i = 0; i < 5; i++) {
    await firstPad.click()
  }
  await expect(page.getByRole('heading', { name: /Let's take a breath/ })).toHaveCount(0)
  await page.screenshot({ path: join(reviewDir, 'games-melody.png') })
  await page.getByRole('button', { name: /Other games/ }).click()
})

test('caregiver Games tab toggles built-in games and manages installed games live', async () => {
  await admin.getByRole('button', { name: 'Games', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()

  // Add an installed game in admin -> Games
  await admin.getByLabel('Game label').fill('Solitaire')
  await admin.getByLabel('Windows path').fill('C:\\Games\\Solitaire.exe')
  await admin.getByRole('button', { name: 'Add installed game', exact: true }).click()

  // Verify it appears in the launcher Games hub immediately
  const solitaireBtn = page.getByRole('button', { name: /Solitaire/ })
  await expect(solitaireBtn).toBeVisible()

  // Uncheck Tic-Tac-Toe in admin -> Games and verify it disappears from the hub
  const tttCheckbox = admin.getByRole('checkbox', { name: /Tic-Tac-Toe/ })
  await tttCheckbox.uncheck()
  await expect(page.getByRole('button', { name: /Tic-Tac-Toe/ })).toHaveCount(0)
  await tttCheckbox.check()
  await expect(page.getByRole('button', { name: /Tic-Tac-Toe/ })).toBeVisible()

  // Test at largest font step (step 4) and reduced motion
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({
      display: { ...config.display, fontStep: 4, theme: 'clayCards' },
      buddy: { ...config.buddy, motion: 'reduced' }
    })
  })
  await expect(page.locator('.games-overlay')).toHaveAttribute('data-reduced-motion', 'true')
  await page.screenshot({ path: join(reviewDir, 'games-hub-large-font.png') })

  // Escape closes the Games hub back to Home
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
