import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let home: Page
let admin: Page
let folder: string
const errors: string[] = []
type FixtureAction = {
  delivery?: 'pending' | 'delivered' | 'failed'
  advance?: number
  reply?: string
  failSubmission?: boolean
}
async function update(action: FixtureAction): Promise<void> {
  await app.evaluate(async (_electron, value) => {
    await (
      globalThis as unknown as {
        __e2e__: { contactFixture: { update: (action: FixtureAction) => Promise<void> } }
      }
    ).__e2e__.contactFixture.update(value)
  }, action)
}
async function count(): Promise<number> {
  return app.evaluate(() =>
    (
      globalThis as unknown as { __e2e__: { contactFixture: { count: () => number } } }
    ).__e2e__.contactFixture.count()
  )
}
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'grammie-family-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  home = await app.firstWindow()
  home.on('pageerror', (error) => errors.push(error.message))
  await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  admin.on('pageerror', (error) => errors.push(error.message))
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.evaluate(() =>
    window.admin.setConfig({
      tiles: ['Weather', 'Photos', 'Music', 'Games'].map((label, slot) => ({
        id: `fixture-${slot}`,
        label,
        type: 'builtin' as const,
        builtinKey: label.toLowerCase() as 'weather' | 'photos' | 'music' | 'games',
        slot,
        size: 'normal' as const,
        colorIndex: slot
      }))
    })
  )
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('caregiver sets names, a library photo, numbers and write-only SMS credentials without sending', async ({
  browserName: _browserName
}, info) => {
  const png = await home.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 160
    const context = canvas.getContext('2d')!
    context.fillStyle = '#347d55'
    context.fillRect(0, 0, 160, 160)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const source = join(folder, 'contact-photo.png')
  await writeFile(source, Buffer.from(png, 'base64'))
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }
  }, source)
  await admin.evaluate(() => window.admin.importPhotos())
  await admin.getByRole('button', { name: 'Contacts', exact: true }).click()
  await admin.getByLabel('Preferred contact name', { exact: true }).fill('Sarah')
  await admin.getByLabel('Preferred contact phone number', { exact: true }).fill('+15551111111')
  await admin
    .getByRole('group', { name: 'Preferred contact photo', exact: true })
    .getByRole('button', { name: /Use photo:/ })
    .click()
  await admin.getByLabel('Try a fallback contact', { exact: true }).check()
  await admin.getByLabel('Fallback contact name', { exact: true }).fill('Tom')
  await admin.getByLabel('Fallback contact phone number', { exact: true }).fill('+15552222222')
  await admin.getByLabel('Show the callback button on Home').check()
  await admin.getByRole('button', { name: 'Save contact settings', exact: true }).click()
  await expect(admin.getByRole('status')).toContainText('Contact settings saved')
  await admin.getByText('SMS credentials', { exact: true }).click()
  await admin.getByLabel('Twilio Account SID', { exact: true }).fill(`AC${'a'.repeat(32)}`)
  await admin.getByLabel('Twilio API Key SID', { exact: true }).fill(`SK${'b'.repeat(32)}`)
  await admin
    .getByLabel('Twilio API key secret', { exact: true })
    .fill('test-secret-not-a-real-key')
  await admin.getByLabel('Twilio sender number', { exact: true }).fill('+15550000000')
  await admin.getByRole('button', { name: 'Save SMS credentials', exact: true }).click()
  await expect(admin.getByRole('status')).toContainText('SMS credentials saved')
  await expect(admin.getByLabel('Twilio API key secret', { exact: true })).toHaveValue('')
  await expect(home.getByRole('button', { name: 'Ask Sarah to call', exact: true })).toBeVisible()
  await expect(home.locator('.contact-button img')).toBeVisible()
  expect(await count()).toBe(0)
  const publicJson = await home.evaluate(async () =>
    JSON.stringify(await window.launcher.getConfig())
  )
  expect(publicJson).not.toContain('+1555')
  expect(publicJson).not.toContain('test-secret')
  await admin.screenshot({ path: info.outputPath('contacts-admin.png'), fullPage: true })
})

test('the contact footprint stays fixed in both Home layouts at all five font sizes', async ({
  browserName: _browserName
}, info) => {
  const original = await home.locator('[data-home-contact-slot]').boundingBox()
  for (const homeLayout of ['simple4', 'more8'] as const) {
    for (let fontStep = 0; fontStep < 5; fontStep++) {
      await admin.evaluate(
        async ({ homeLayout, fontStep }) => {
          const config = await window.admin.getConfig()
          await window.admin.setConfig({
            display: { ...config.display, homeLayout, fontStep, theme: 'clayCards' }
          })
        },
        { homeLayout, fontStep }
      )
      await expect
        .poll(() =>
          home.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim()
          )
        )
        .toBe(String([1, 1.15, 1.3, 1.45, 1.6][fontStep]))
      const button = home.getByRole('button', { name: 'Ask Sarah to call', exact: true })
      await expect(button).toBeVisible()
      await expect
        .poll(() =>
          button.evaluate(
            (element) =>
              element.scrollHeight <= element.clientHeight + 1 &&
              element.scrollWidth <= element.clientWidth + 1
          )
        )
        .toBe(true)
      const slot = await home.locator('[data-home-contact-slot]').boundingBox()
      expect(slot?.y).toBeCloseTo(original!.y, 0)
    }
  }
  await home.screenshot({ path: info.outputPath('contact-home-largest.png') })
})

test('delivery and YES have different screens; repeated taps and reopening never duplicate the request', async ({
  browserName: _browserName
}, info) => {
  const button = home.getByRole('button', { name: 'Ask Sarah to call', exact: true })
  await button.click()
  await expect(home.getByRole('heading', { name: 'Sending…', exact: true })).toBeVisible()
  await expect(home.getByText(/notified|coming|saw your request/)).toHaveCount(0)
  for (let tap = 0; tap < 3; tap++) {
    await home.getByRole('button', { name: 'Back to Home', exact: true }).click()
    await button.click()
  }
  expect(await count()).toBe(1)
  await home.reload()
  await expect(button).toBeVisible()
  await button.click()
  await expect(home.getByRole('heading', { name: 'Sending…', exact: true })).toBeVisible()
  expect(await count()).toBe(1)
  await update({ delivery: 'delivered' })
  await expect(
    home.getByRole('heading', { name: 'Request delivered to Sarah.', exact: true })
  ).toBeVisible()
  await home.screenshot({ path: info.outputPath('contact-delivered-largest.png') })
  await update({ reply: 'preferred' })
  await expect(
    home.getByRole('heading', { name: 'Sarah saw your request.', exact: true })
  ).toBeVisible()
  await home.getByRole('button', { name: 'Back to Home', exact: true }).click()
  await expect(home.getByRole('dialog', { name: "Let's take a breath" })).toHaveCount(0)
  expect(await count()).toBe(1)
})

test('fallback, late preferred reply, failure, expiry and Buddy guidance remain truthful', async ({
  browserName: _browserName
}, info) => {
  await update({ advance: 601_000, delivery: 'pending' })
  await home.getByRole('button', { name: 'Ask Sarah to call', exact: true }).click()
  await expect(home.getByRole('heading', { name: 'Sending…', exact: true })).toBeVisible()
  await expect.poll(count).toBe(2)
  await update({ advance: 121_000 })
  await expect(
    home.getByRole('heading', { name: 'Asking Tom to call…', exact: true })
  ).toBeVisible()
  await expect.poll(count).toBe(3)
  await update({ reply: 'preferred' })
  await expect(
    home.getByRole('heading', { name: 'Sarah saw your request.', exact: true })
  ).toBeVisible()
  await home.getByRole('button', { name: 'Back to Home', exact: true }).click()
  await update({ advance: 601_000, failSubmission: true })
  await home.getByRole('button', { name: 'Ask Sarah to call', exact: true }).click()
  await expect(
    home.getByRole('heading', { name: "We couldn't confirm this request.", exact: true })
  ).toBeVisible()
  await expect(
    home.getByText('Please use your telephone to call family, or tell someone nearby.')
  ).toBeVisible()
  await home.screenshot({ path: info.outputPath('contact-failure-largest.png') })
  await update({ advance: 601_000 })
  await expect(
    home.getByRole('heading', { name: 'No reply was confirmed.', exact: true })
  ).toBeVisible()
  await home.getByRole('button', { name: 'Back to Home', exact: true }).click()
  const sends = await count()
  const reply = await home.evaluate(() =>
    window.launcher.buddyChat([{ role: 'user', text: 'I am scared' }])
  )
  expect(reply.reply).toContain('Ask Sarah to call')
  expect(await count()).toBe(sends)
  const logs = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog(1000)))
  expect(logs).not.toContain('+1555')
  expect(logs).not.toContain('test-secret')
  expect(errors).toEqual([])
})

test('a long familiar name remains readable and a removed photo falls back to the phone icon', async () => {
  const sends = await count()
  await admin.evaluate(async () => {
    const settings = await window.admin.getContactSettings()
    const photo = (await window.admin.listPhotos())[0]
    if (photo) await window.admin.removePhoto(photo.id)
    await window.admin.saveContactSettings({
      ...settings,
      preferred: { ...settings.preferred!, name: 'WWWWWWWWWWWW' }
    })
  })
  const button = home.getByRole('button', { name: 'Ask WWWWWWWWWWWW to call', exact: true })
  await expect(button).toBeVisible()
  await expect(button.locator('img')).toHaveCount(0)
  await expect(button.locator('svg')).toBeVisible()
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const text = element.querySelector('.contact-button-label')!
        return (
          text.scrollWidth <= text.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1
        )
      })
    )
    .toBe(true)
  expect(await count()).toBe(sends)
})
