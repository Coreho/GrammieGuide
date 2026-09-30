import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HOME_RECOVERY_RECORD } from '../../src/main/services/reliability/homeRecoveryRecord'
import { HOME_UNRESPONSIVE_GRACE_MS } from '../../src/main/services/reliability/homeRecovery'

let app: ElectronApplication
let userDataDir: string

async function launchHome(): Promise<ElectronApplication> {
  const launched = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  // Keep cleanup possible even if the first load fails.
  app = launched
  const page = await launched.firstWindow()
  await expect(page.getByText(/No tiles configured yet/i)).toBeVisible({ timeout: 15_000 })
  return launched
}

test.beforeEach(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'grammieguide-home-recovery-'))
  await launchHome()
})

test.afterEach(async () => {
  await app?.close()
  rmSync(userDataDir, { recursive: true, force: true })
})

async function expectHomeRunning(): Promise<void> {
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
  expect(app.process().exitCode).toBeNull()
  expect(app.process().signalCode).toBeNull()
}

async function recoverHome(trigger: 'crash' | 'freeze'): Promise<void> {
  const mainProcess = app.process()
  const recovered = await app.evaluate(async ({ BrowserWindow }, trigger) => {
    const launcher = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().endsWith('/launcher/index.html')
    )
    if (!launcher) throw new Error('Launcher window not found')
    const contents = launcher.webContents
    const originalProcessId = contents.getOSProcessId()
    // Subscribe before triggering recovery so the old load cannot pass the test.
    const gone = new Promise<string>((resolve) => {
      contents.once('render-process-gone', (_event, details) => resolve(details.reason))
    })
    const loaded = new Promise<void>((resolve) => {
      contents.once('did-finish-load', () => resolve())
    })
    const started = performance.now()
    if (trigger === 'freeze') launcher.emit('unresponsive')
    else contents.forcefullyCrashRenderer()
    const reason = await gone
    await loaded
    return {
      reason,
      elapsed: performance.now() - started,
      originalProcessId,
      recoveredProcessId: contents.getOSProcessId(),
      windowAlive: !launcher.isDestroyed()
    }
  }, trigger)

  expect(['killed', 'crashed']).toContain(recovered.reason)
  expect(recovered.windowAlive).toBe(true)
  expect(recovered.recoveredProcessId).toBeGreaterThan(0)
  expect(recovered.recoveredProcessId).not.toBe(recovered.originalProcessId)
  if (trigger === 'freeze')
    expect(recovered.elapsed).toBeGreaterThanOrEqual(HOME_UNRESPONSIVE_GRACE_MS)
  await expectHomeRunning()
  expect(app.process()).toBe(mainProcess)
}

test('Home reloads itself after its renderer crashes and the app stays running', async () => {
  await recoverHome('crash')
})

test('Home kills and reloads a frozen renderer after the grace period', async () => {
  test.setTimeout(90_000)
  await recoverHome('freeze')
})

test('Home cancels freeze recovery when the renderer becomes responsive', async () => {
  test.setTimeout(90_000)
  const result = await app.evaluate(async ({ BrowserWindow }, graceMs) => {
    const launcher = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().endsWith('/launcher/index.html')
    )
    if (!launcher) throw new Error('Launcher window not found')
    const contents = launcher.webContents
    const originalProcessId = contents.getOSProcessId()
    launcher.emit('unresponsive')
    await new Promise<void>((resolve) => setTimeout(resolve, 500))
    launcher.emit('responsive')
    // Observe past the original deadline; an immediate PID check would miss an uncancelled timer.
    await new Promise<void>((resolve) => setTimeout(resolve, graceMs + 1000))
    return { originalProcessId, processId: contents.getOSProcessId() }
  }, HOME_UNRESPONSIVE_GRACE_MS)
  expect(result.originalProcessId).toBeGreaterThan(0)
  expect(result.processId).toBe(result.originalProcessId)
  await expectHomeRunning()
})

test('four crashes hand off to the watchdog and restore the give-up log after restart', async () => {
  test.setTimeout(120_000)
  for (let attempt = 0; attempt < 3; attempt++) await recoverHome('crash')

  const mainProcess = app.process()
  await app.evaluate(({ BrowserWindow }) => {
    const launcher = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().endsWith('/launcher/index.html')
    )
    if (!launcher) throw new Error('Launcher window not found')
    // Return to Playwright before the fourth crash closes its main-process connection.
    setTimeout(() => launcher.webContents.forcefullyCrashRenderer(), 100)
  })
  await expect.poll(() => mainProcess.exitCode, { timeout: 30_000 }).toBe(1)
  expect(mainProcess.signalCode).toBeNull()
  expect(existsSync(join(userDataDir, 'quit-flag.txt'))).toBe(false)
  const recordPath = join(userDataDir, HOME_RECOVERY_RECORD)
  expect(existsSync(recordPath)).toBe(true)
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  expect(Number.isFinite(Date.parse(record.ts))).toBe(true)
  expect(record.detail).toContain('recovery limit reached; renderer gone:')

  await app.close()
  await launchHome()
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  const admin = await opened
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
  const log = await admin.evaluate(() => window.admin.getReliabilityLog())
  expect(log).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'home-recovery-gave-up',
        ok: false,
        detail: `Home recovery gave up before this restart at ${record.ts}; ${record.detail}`
      })
    ])
  )
  expect(existsSync(recordPath)).toBe(false)
  expect(existsSync(join(userDataDir, 'quit-flag.txt'))).toBe(false)
})
