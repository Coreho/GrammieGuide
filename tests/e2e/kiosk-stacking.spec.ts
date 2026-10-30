import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Kiosk Home is always on top. On her computer the admin window opened behind
// it, and admin's file pickers and the ChatGPT sign-in browser would have too.
// The real stacking can't be seen in an invisible e2e run, so this checks the
// window settings that decide it. Kiosk mode is off in dev builds, so this runs
// against a packaged app, and only one you name and build for it:
//
//   npm run build
//   npx electron-builder --win --dir -c.directories.output=<folder> -c.win.requestedExecutionLevel=asInvoker
//   GRAMMIEGUIDE_PACKAGED_EXE=<folder>/win-unpacked/GrammieGuide.exe npx playwright test kiosk-stacking
//
// Never the normal package. It asks Windows for admin rights, and a copy approved
// at that prompt acted as the real app: on her computer it took over her startup
// and watchdog tasks. Whatever happens to be in dist/ isn't used for the same reason.

const packagedExe = process.env['GRAMMIEGUIDE_PACKAGED_EXE']
test.skip(
  !packagedExe || !existsSync(packagedExe),
  'needs GRAMMIEGUIDE_PACKAGED_EXE: kiosk mode is off in dev builds (see the top of this file)'
)

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
  // Before launching: by the time a prompt appears, it's too late to refuse.
  if (!readFileSync(packagedExe!).includes('level="asInvoker"')) {
    throw new Error(
      `Refusing to launch ${packagedExe}: it wasn't built with requestedExecutionLevel=asInvoker (see the top of this file)`
    )
  }
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
  // Polled: Home may not have gone on top yet the moment its first window appears.
  await expect.poll(stacking).toEqual({ homeOnTop: true, adminOwnedByHome: null })

  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  await expect.poll(stacking).toEqual({ homeOnTop: false, adminOwnedByHome: true })

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getParentWindow() !== null)
      ?.close()
  })
  await expect.poll(stacking).toEqual({ homeOnTop: true, adminOwnedByHome: null })
})
