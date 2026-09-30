import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let launcherPage: Page

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-home-recovery-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  launcherPage = await app.firstWindow()
  await launcherPage.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

test('Home reloads itself after its renderer crashes and the app stays running', async () => {
  await expect(launcherPage.getByText(/No tiles configured yet/i)).toBeVisible({
    timeout: 10_000
  })
  const mainProcess = app.process()
  const recovered = await app.evaluate(async ({ BrowserWindow }) => {
    const launcher = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().endsWith('/launcher/index.html')
    )
    if (!launcher) throw new Error('Launcher window not found')
    const contents = launcher.webContents
    const originalProcessId = contents.getOSProcessId()
    // Subscribe before the crash so cached visibility or load state cannot pass the test.
    const gone = new Promise<string>((resolve) => {
      contents.once('render-process-gone', (_event, details) => resolve(details.reason))
    })
    const loaded = new Promise<void>((resolve) => {
      contents.once('did-finish-load', () => resolve())
    })
    contents.forcefullyCrashRenderer()
    const reason = await gone
    await loaded
    return {
      reason,
      originalProcessId,
      recoveredProcessId: contents.getOSProcessId(),
      windowAlive: !launcher.isDestroyed()
    }
  })

  expect(['killed', 'crashed']).toContain(recovered.reason)
  expect(recovered.windowAlive).toBe(true)
  expect(recovered.recoveredProcessId).toBeGreaterThan(0)
  expect(recovered.recoveredProcessId).not.toBe(recovered.originalProcessId)
  // Playwright's page handle dies with the old renderer, so ask the reloaded Home directly.
  await expect
    .poll(
      () =>
        app.evaluate(({ BrowserWindow }) => {
          const launcher = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().endsWith('/launcher/index.html')
          )
          return launcher?.webContents.executeJavaScript(
            `/No tiles configured yet/i.test(document.body.innerText)`
          )
        }),
      { timeout: 15_000 }
    )
    .toBe(true)
  expect(app.process()).toBe(mainProcess)
  expect(mainProcess.exitCode).toBeNull()
  expect(mainProcess.signalCode).toBeNull()
})
