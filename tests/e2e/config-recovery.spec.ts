import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * An unreadable config file used to crash-loop the kiosk (TASK-39).
 *
 * store.ts built its electron-store at module load, electron-store reads the file
 * in its constructor and rethrows a JSON SyntaxError, and store.ts is imported at
 * the top of index.ts - before app.whenReady. The backup-and-defaults fallback
 * lived inside loadConfig, so it could never run. The watchdog then relaunched the
 * app into the same crash, which is the worst outcome on a machine nobody is
 * sitting at.
 *
 * This drives the real built app with a truncated file, which is the only place
 * the crash-loop is genuinely observable.
 */

const TRUNCATED = '{"tiles":['

let app: ElectronApplication
let page: Page
let userDataDir: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-config-recovery-'))
  writeFileSync(join(userDataDir, 'grammieguide-config.json'), TRUNCATED, 'utf8')

  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

test('the kiosk boots to Home instead of crash-looping on an unreadable config', async () => {
  // Home rendered at all, which is the whole point: before the fix main threw a
  // SyntaxError before whenReady and no window ever appeared.
  await expect(page.getByRole('main', { name: 'Home tiles' })).toBeVisible()
  await expect(page.getByText('No tiles configured yet')).toBeVisible()
})

test('exactly one byte-for-byte copy of the unreadable file is kept', () => {
  const backups = readdirSync(userDataDir).filter((name) => name.startsWith('config.corrupt-'))
  expect(backups).toHaveLength(1)
  // A copy, not a re-serialised dump: the point is to keep what actually failed.
  expect(readFileSync(join(userDataDir, backups[0]!), 'utf8')).toBe(TRUNCATED)
})

test('the live config is rewritten as valid JSON with no tiles', () => {
  const written = JSON.parse(readFileSync(join(userDataDir, 'grammieguide-config.json'), 'utf8'))
  expect(written.tiles).toEqual([])
  expect(typeof written.schemaVersion).toBe('number')
})

test('the caregiver is told, without the log carrying any config value', async () => {
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  const admin = await opened
  await admin.waitForLoadState('domcontentloaded')

  // The reset cleared the stored PIN, so admin opens straight to Set PIN. That is
  // exactly the recovery step the README tells the caregiver to take, and setting
  // one here is what unlocks the reliability log.
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()

  const resets = await admin.evaluate(() => window.admin.getReliabilityLog(50))
  const reset = resets.find((event) => event.op === 'config-reset')
  expect(reset).toBeDefined()
  expect(reset!.ok).toBe(false)
  // Names the backup, so the caregiver can find the file that caused it...
  expect(reset!.detail).toMatch(/config\.corrupt-\d+\.json/)
  // ...and nothing from the file itself. A JSON SyntaxError quotes the offending
  // source, so the message must not have been reused.
  expect(reset!.detail).not.toContain('Unexpected token')
  expect(reset!.detail).not.toContain('position')
  expect(reset!.detail).not.toContain('{"tiles"')
})
