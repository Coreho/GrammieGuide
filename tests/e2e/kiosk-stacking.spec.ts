import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Kiosk Home is always on top. On her computer the admin window opened behind
// it, and admin's file pickers and the ChatGPT sign-in browser would have too.
// The real stacking can't be seen in an invisible e2e run, so this checks the
// window settings that decide it. Kiosk mode is off in dev builds, so this runs
// against the packaged app (npm run package) and skips without one.

const packagedExe =
  process.env['GRAMMIEGUIDE_PACKAGED_EXE'] ??
  join(process.cwd(), 'dist', 'win-unpacked', 'GrammieGuide.exe')
test.skip(!existsSync(packagedExe), 'needs the packaged app: kiosk mode is off in dev builds')

let app: ElectronApplication

type Stacking = { homeOnTop: boolean; adminOwnedByHome: boolean | null }

const stacking = (): Promise<Stacking> =>
  app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    const home = windows.find((w) => !w.getParentWindow() && w.getTitle() !== 'GrammieGuide Admin')
    const admin = windows.find(
      (w) => w.getParentWindow() !== null || w.getTitle() === 'GrammieGuide Admin'
    )
    return {
      homeOnTop: home?.isAlwaysOnTop() ?? false,
      adminOwnedByHome: admin ? admin.getParentWindow() === home : null
    }
  })

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: packagedExe,
    args: [`--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-stacking-'))}`],
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('Home steps down from always on top while admin is open, then goes back up', async () => {
  expect(await stacking()).toEqual({ homeOnTop: true, adminOwnedByHome: null })

  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  expect(await stacking()).toEqual({ homeOnTop: false, adminOwnedByHome: true })

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getParentWindow() !== null)
      ?.close()
  })
  await expect.poll(stacking).toEqual({ homeOnTop: true, adminOwnedByHome: null })
})
