import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let app: ElectronApplication
let page: Page
let admin: Page

const PIN = '2468'
const section = (id: string): Locator => admin.locator(`[data-check="${id}"]`)
const status = (id: string): Locator => section(id).locator('[data-check-status]')

async function setOnline(online: boolean): Promise<void> {
  await app.evaluate((_electron, value) => {
    ;(
      globalThis as unknown as { __e2e__: { setDeviceOnline: (online: boolean) => void } }
    ).__e2e__.setDeviceOnline(value)
  }, online)
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-checks-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const newWindow = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await newWindow
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill(PIN)
  await admin.getByPlaceholder('Confirm PIN').fill(PIN)
  await admin.getByRole('button', { name: 'Set PIN' }).click()
  await admin.getByRole('button', { name: 'Checks', exact: true }).click()
})

test.afterAll(async () => {
  await app.close()
})

test('nothing is shown as checked until a check runs', async () => {
  await expect(section('voice')).toContainText('Not checked since GrammieGuide started.')
  await expect(section('connectivity')).toContainText('Not checked since GrammieGuide started.')
})

test('connectivity reports offline plainly, with the time it was checked', async () => {
  await setOnline(false)
  try {
    await section('connectivity').getByRole('button', { name: 'Check now' }).click()
    await expect(status('connectivity')).toHaveAttribute('data-check-status', 'failed')
    await expect(section('connectivity')).toContainText("isn't connected to a network")
    await expect(section('connectivity')).toContainText(/Checked .*\(just now\)/)
  } finally {
    await setOnline(true)
  }
})

test('browser recovery shows the recovery screen on Home, then returns Home', async () => {
  await section('browserRecovery').getByRole('button', { name: 'Check now' }).click()
  // Home really opens the failing page and shows its friendly recovery screen...
  await expect(page.getByRole('alert')).toBeVisible()
  // ...then the check closes it the way her Home button does.
  await expect(status('browserRecovery')).toHaveAttribute('data-check-status', 'passed')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '🏠 Home', exact: true })).toHaveCount(0)
})

test('the voice check waits for the caregiver before it passes', async () => {
  // Use the Windows voice so the test needs no network.
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({ buddy: { ...config.buddy, cloudTtsEnabled: false } })
  })
  await section('voice').getByRole('button', { name: 'Check now' }).click()
  await expect(status('voice')).toHaveAttribute('data-check-status', /^(played|unavailable)$/, {
    timeout: 20_000
  })
  if ((await status('voice').getAttribute('data-check-status')) === 'unavailable') {
    test.info().annotations.push({ type: 'note', description: 'No Windows voice on this machine' })
    return
  }
  await expect(section('voice')).toContainText('Did you hear it?')
  await section('voice').getByRole('button', { name: 'I heard it' }).click()
  await expect(status('voice')).toHaveAttribute('data-check-status', 'passed')
  await expect(section('voice')).toContainText('You heard Buddy speak.')
})

test('checks are admin-only, and locking stops a running microphone check', async () => {
  await section('microphone').getByRole('button', { name: 'Check now' }).click()
  const state = await status('microphone').getAttribute('data-check-status')
  await admin.getByRole('button', { name: 'Lock' }).click()
  await expect(admin.getByPlaceholder('Enter PIN')).toBeVisible()

  // Main refuses every check while locked, whatever the window asks for.
  const refusal = await admin.evaluate(() =>
    window.admin.runCheck('connectivity').then(
      () => 'ran',
      (error: Error) => error.message
    )
  )
  expect(refusal).toContain('unlock')

  await admin.getByPlaceholder('Enter PIN').fill(PIN)
  await admin.getByRole('button', { name: 'Unlock' }).click()
  await admin.getByRole('button', { name: 'Checks', exact: true }).click()
  // The lock stopped it, unless a machine with no recognizer finished first.
  await expect(status('microphone')).toHaveAttribute(
    'data-check-status',
    state === 'checking' ? /^(cancelled|unavailable|failed)$/ : /^(unavailable|failed)$/
  )
})
