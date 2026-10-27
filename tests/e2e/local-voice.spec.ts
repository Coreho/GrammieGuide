import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/**
 * TASK-65: Buddy's voice on this computer, end to end in the built app - the
 * utility process starts, loads Kokoro from resources/voice-model with no
 * network, and returns a WAV the caregiver can play. Other suites keep the
 * Windows fallback (the local voice is off under e2e unless
 * GRAMMIEGUIDE_LOCAL_VOICE=1), so this is the one that loads the model.
 */

const MODEL = resolve('resources/voice-model/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx')

let app: ElectronApplication
let admin: Page
let page: Page

test.describe.configure({ mode: 'serial' })
test.skip(!existsSync(MODEL), 'Run `npm run fetch:voice` first')

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-e2e-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1', GRAMMIEGUIDE_LOCAL_VOICE: '1' }
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
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN' }).click()
})

test.afterAll(async () => {
  await app.close()
})

test('the voice on this computer speaks a line as a WAV, offline', async () => {
  test.setTimeout(120_000)
  const result = await admin.evaluate(() =>
    window.admin.previewLocalVoice("Hi there! It's so nice to see you today.", 'am_michael')
  )
  expect(result).toMatchObject({ ok: true, mime: 'audio/wav', source: 'local' })
  const bytes = Buffer.from((result as { audioBase64: string }).audioBase64, 'base64')
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
  // About two seconds of 24 kHz speech at the very least.
  expect(bytes.length).toBeGreaterThan(24_000 * 4 * 2)
})

test('the caregiver can choose and try it in the Buddy tab', async () => {
  test.setTimeout(60_000)
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await admin.getByLabel(/Voice on this computer/).selectOption('bm_george')
  await expect
    .poll(() => admin.evaluate(() => window.admin.getConfig().then((c) => c.buddy.localVoice)))
    .toBe('bm_george')
  await admin.getByRole('button', { name: "Try this computer's voice" }).click()
  await expect(admin.getByText("isn't available")).toHaveCount(0)
  await expect(admin.getByText('Playing…')).toBeVisible({ timeout: 30_000 })
})

test('with the online voice off, Buddy on Home speaks with it instead of the Windows voice', async () => {
  test.setTimeout(60_000)
  await admin.getByLabel(/Use the natural online voice/).uncheck()
  await expect
    .poll(() =>
      page.evaluate(() => window.launcher.getConfig().then((c) => c.buddy.cloudTtsEnabled))
    )
    .toBe(false)
  // Record which voice path Home takes, without needing speakers.
  await page.evaluate(() => {
    const body = document.body.dataset
    body.testPlays = '0'
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      body.testPlays = String(Number(body.testPlays) + 1)
      return play.call(this)
    }
    window.speechSynthesis.speak = (utterance): void => {
      body.testWindowsVoice = utterance.text
      queueMicrotask(() => utterance.dispatchEvent(new Event('end')))
    }
  })
  await page.getByRole('button', { name: 'Say hello to Buddy' }).click()
  await expect(page.locator('body')).not.toHaveAttribute('data-test-plays', '0', {
    timeout: 30_000
  })
  expect(await page.locator('body').getAttribute('data-test-windows-voice')).toBeNull()
})
