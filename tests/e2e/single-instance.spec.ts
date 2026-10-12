import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A second launch used to open a second kiosk over the first, both writing the
 * same config, media indexes and heartbeat. Now it must exit straight away.
 */

/** The binary Playwright launches, located the way electron's own index.js does. */
const electronDir = join(process.cwd(), 'node_modules', 'electron')
const electronBinary = join(
  electronDir,
  'dist',
  readFileSync(join(electronDir, 'path.txt'), 'utf8').trim()
)

const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-single-instance-'))
let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('a second launch on the same profile exits at once and leaves Home running', async () => {
  await expect(page.getByRole('main', { name: 'Home tiles' })).toBeVisible()
  const windowsBefore = app.windows().length

  const second = spawn(electronBinary, ['.', `--user-data-dir=${userDataDir}`], {
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' },
    stdio: 'ignore'
  })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill()
      reject(new Error('the second launch kept running'))
    }, 20_000)
    second.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })

  expect(exitCode).toBe(0)
  // Still the one kiosk, and Home still answers.
  expect(app.windows()).toHaveLength(windowsBefore)
  await expect(page.getByRole('main', { name: 'Home tiles' })).toBeVisible()
  const tiles = await page.evaluate(() => window.launcher.getConfig().then((c) => c.tiles))
  expect(Array.isArray(tiles)).toBe(true)
})
