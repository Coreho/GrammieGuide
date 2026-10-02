import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M4 Buddy on Home, against the built app: the rigged cat actually loads
 * under the launcher's CSP (the GLB, its blob: texture, no WebAssembly
 * decoders), his behavior follows the chat panel, and the caregiver's new
 * Buddy settings stick. The floor exposes the behavior machine's current
 * activity as data-buddy-activity, which is what these assertions read.
 */

let app: ElectronApplication
let page: Page
let admin: Page

test.describe.configure({ mode: 'serial' })
const problems: string[] = []

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-e2e-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  await page.waitForLoadState('domcontentloaded')
  // Install before the actor starts: its captured Date.now must agree with fake timers.
  await page.clock.install({ time: new Date(2026, 8, 30, 14, 0) })
  await page.reload()
})

test.afterAll(async () => {
  await app.close()
})

test('the cat model loads with no errors and Buddy greets her', async () => {
  const floor = page.locator('[data-buddy-activity]')
  await expect(floor).toBeVisible()
  await expect(floor.locator('canvas')).toBeVisible()
  // Give the GLB and its texture time to load, then make sure nothing complained.
  await page.waitForTimeout(3000)
  expect(problems).toEqual([])
})

test('he joins the chat and says goodbye when it closes', async () => {
  const floor = page.locator('[data-buddy-activity]')
  await expect(page.getByRole('button', { name: 'Say hello to Buddy' })).toBeVisible()
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('menuitem', { name: "Let's chat" }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', /^chat\./)
  await expect(page.getByPlaceholder('Say something...')).toBeVisible()

  await page.getByRole('button', { name: 'Close chat' }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'farewell')
  await expect(page.getByRole('status')).toBeVisible()
})

test('admin: interaction, motion and voice settings are saved', async () => {
  const newWindowPromise = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await newWindowPromise
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN' }).click()
  await admin.getByRole('button', { name: 'Buddy' }).click()

  const motion = admin.getByLabel('How Buddy moves')
  const tapAction = admin.getByLabel('When she taps Buddy')
  const readAloud = admin.getByLabel(/Read Buddy's replies out loud/)
  await expect(motion).toHaveValue('roam')
  await expect(tapAction).toHaveValue('reaction')
  await expect(readAloud).toBeChecked()
  await motion.selectOption('still')
  await expect(page.locator('[data-buddy-activity]')).toHaveAttribute('data-buddy-motion', 'still')
  await readAloud.uncheck()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.voiceEnabled)))
    .toBe(false)
  await admin
    .locator('select', { has: admin.locator('option[value="en-US-GuyNeural"]') })
    .selectOption('en-US-GuyNeural')

  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy)))
    .toMatchObject({
      motion: 'still',
      tapAction: 'reaction',
      voiceEnabled: false,
      ttsVoice: 'en-US-GuyNeural'
    })
})

test('changing tap action applies live: one tap opens chat with no reaction or invitation', async () => {
  const buddy = page.getByRole('button', { name: 'Say hello to Buddy' })
  const floor = page.locator('[data-buddy-activity]')
  const invitation = page.locator('[data-buddy-chat-invite]')
  await buddy.click()
  await expect(invitation).toBeVisible()
  await admin.getByLabel('When she taps Buddy').selectOption('chat')
  await expect(invitation).toHaveCount(0)
  // Watch intermediate states too: a fleeting reaction before chat is still an extra action.
  await floor.evaluate((el) => {
    document.body.dataset.testTapStates = ''
    new MutationObserver((records) => {
      const states = records.map((r) => r.oldValue).filter(Boolean)
      document.body.dataset.testTapStates += states.join(',') + ','
    }).observe(el, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-buddy-activity']
    })
  })
  // Let the previous reaction finish before observing the direct-chat tap.
  await expect(floor).not.toHaveAttribute('data-buddy-activity', 'commanded', { timeout: 21_000 })
  await page.evaluate(() => {
    document.body.dataset.testTapStates = ''
  })
  await buddy.click()
  await expect(page.getByPlaceholder('Say something...')).toBeVisible()
  await expect(floor).toHaveAttribute('data-buddy-activity', /^chat\./)
  await expect(floor).not.toHaveAttribute('data-buddy-clip')
  await expect(invitation).toHaveCount(0)
  expect(await page.locator('body').getAttribute('data-test-tap-states')).not.toContain('commanded')
  await buddy.click({ clickCount: 22, delay: 10 })
  await expect(floor).toHaveAttribute('data-buddy-activity', 'chat.petted')
  await expect(page.getByRole('heading', { name: "Let's take a breath" })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close chat' }).click()
  await admin.getByLabel('When she taps Buddy').selectOption('reaction')
  await expect
    .poll(() => page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.tapAction)))
    .toBe('reaction')
  await buddy.click()
  await expect(invitation).toBeVisible()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'commanded')
})

test('motion changes in admin stop and resume Home behavior without a reload', async () => {
  const floor = page.locator('[data-buddy-activity]')
  const motion = admin.getByLabel('How Buddy moves')
  await page.evaluate(() => {
    document.body.dataset.testHomeAlive = 'same-document'
  })
  // Update Home's minute clock and finish the previous reaction.
  await page.clock.fastForward(60_000)
  await admin.getByLabel('How Buddy moves').selectOption('roam')
  await expect(floor).toHaveAttribute('data-buddy-motion', 'roam')
  for (let i = 0; i < 8 && (await floor.getAttribute('data-buddy-activity')) !== 'strolling'; i++) {
    await page.clock.fastForward(26_000)
  }
  await expect(floor).toHaveAttribute('data-buddy-activity', 'strolling')
  await motion.selectOption('still')
  await expect(floor).toHaveAttribute('data-buddy-motion', 'still')
  await expect(floor).not.toHaveAttribute('data-buddy-activity', 'strolling')
  const stoppedTarget = await floor.getAttribute('data-buddy-target')
  let fidgeted = false
  for (let i = 0; i < 6; i++) {
    await page.clock.fastForward(26_000)
    const activity = await floor.getAttribute('data-buddy-activity')
    expect(activity).not.toBe('strolling')
    fidgeted ||= activity === 'fidgeting'
  }
  expect(fidgeted).toBe(true)
  await expect(floor).toHaveAttribute('data-buddy-target', stoppedTarget!)
  await motion.selectOption('reduced')
  await expect(floor).toHaveAttribute('data-buddy-motion', 'reduced')
  await expect(floor).toHaveAttribute('data-buddy-activity', 'resting')
  const reducedTarget = await floor.getAttribute('data-buddy-target')
  for (let i = 0; i < 6; i++) {
    await page.clock.fastForward(30_000)
    await expect(floor).toHaveAttribute('data-buddy-activity', 'resting')
    await expect(floor).toHaveAttribute('data-buddy-target', reducedTarget!)
  }
  // The caregiver menu is still a deliberate override in reduced motion.
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('menuitem', { name: 'Take a walk' }).click()
  await expect(floor).toHaveAttribute('data-buddy-activity', 'strolling')
  await admin.evaluate(() => window.admin.commandBuddy({ clip: 'dance' }))
  await expect(floor).toHaveAttribute('data-buddy-clip', 'dance')
  await page.clock.fastForward(21_000)
  await motion.selectOption('roam')
  await expect(floor).toHaveAttribute('data-buddy-motion', 'roam')
  for (let i = 0; i < 8 && (await floor.getAttribute('data-buddy-activity')) !== 'strolling'; i++) {
    await page.clock.fastForward(26_000)
  }
  await expect(floor).toHaveAttribute('data-buddy-activity', 'strolling')
  await expect(page.locator('body')).toHaveAttribute('data-test-home-alive', 'same-document')
  expect(problems).toEqual([])
})
