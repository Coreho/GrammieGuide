import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, uptime } from 'node:os'
import { join } from 'node:path'

// TASK-25: the caregiver's Status tab, from a health record seeded the way an
// earlier run would have left it: one run that died without recording an
// ending, one already known to have lost power, and a watchdog relaunch.
let app: ElectronApplication
let admin: Page
let folder: string
const errors: string[] = []
const PIN = '2468'
const row = (label: string): Locator =>
  admin.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]')

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  const home = await app.firstWindow()
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
  await admin.waitForLoadState('domcontentloaded')
}

async function unlock(first: boolean): Promise<void> {
  if (first) {
    await admin.getByPlaceholder('4-8 digit PIN').fill(PIN)
    await admin.getByPlaceholder('Confirm PIN').fill(PIN)
    await admin.getByRole('button', { name: 'Set PIN' }).click()
  } else {
    await admin.getByPlaceholder('Enter PIN').fill(PIN)
    await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
  }
  await admin.getByRole('button', { name: 'Status', exact: true }).click()
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'grammie-status-'))
  const now = Date.now()
  // Windows booted at bootAt; the unfinished run lived entirely after it, so
  // it counts as GrammieGuide stopping, not as a power cut.
  const bootAt = now - uptime() * 1000
  const startedAt = Math.max(bootAt + 1_000, now - 120_000)
  await writeFile(
    join(folder, 'health-record.json'),
    JSON.stringify({
      version: 1,
      runs: [
        {
          startedAt: now - 5 * 3_600_000,
          homeReadyAt: now - 5 * 3_600_000 + 5_000,
          lastAliveAt: now - 3 * 3_600_000,
          ending: 'power-loss',
          endedAt: now - 3 * 3_600_000
        },
        { startedAt, homeReadyAt: startedAt + 5_000 }
      ]
    })
  )
  await writeFile(join(folder, 'heartbeat.txt'), String(startedAt + 30_000))
  await writeFile(
    join(folder, 'safety-events.log'),
    `${JSON.stringify({ ts: new Date(now - 60_000).toISOString(), type: 'watchdog-hang-detected', detail: 'x' })}\r\n` +
      `${JSON.stringify({ ts: new Date(now - 58_000).toISOString(), type: 'watchdog-relaunch-succeeded', detail: 'x' })}\r\n`
  )
  await launch()
  await unlock(true)
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('the Status tab reports what happened, kind by kind', async ({ browserName: _b }, info) => {
  await expect(row('GrammieGuide stopped unexpectedly')).toHaveText(/^once, most recently/)
  await expect(row('Restarted by the watchdog')).toHaveText(/^once, most recently/)
  await expect(row('Computer lost power or was forced off')).toHaveText(/^once, most recently/)
  await expect(row('Windows shut down, restarted or signed out')).toHaveText('Never.')
  await expect(row('GrammieGuide closed on purpose')).toHaveText('Never.')
  await expect(row('Help requests that failed')).toHaveText('None.')
  await expect(row('Last successful startup')).toHaveText(/today at .*\(Home loaded\)\.$/)
  await expect(row('GrammieGuide running since')).toHaveText(/^today at/)
  await expect(row('Internet')).toHaveText(/^(Online since|Offline since|Not checked yet)/)
  await expect(admin.locator('[data-status="sound"]')).toHaveText(
    'Nobody has confirmed hearing a test sound yet.'
  )
  // Facts about the computer only: nothing about her.
  const text = await admin.locator('main, body').first().innerText()
  expect(text).not.toMatch(/distress|emergency|inactive|inactivity|no activity|tapp/i)
  await admin.screenshot({ path: info.outputPath('status.png'), fullPage: true })
})

test('Test sound counts only once the caregiver says they heard it, and is kept', async () => {
  // The Windows voice, so the test needs no network.
  await admin.evaluate(async () => {
    const config = await window.admin.getConfig()
    await window.admin.setConfig({ buddy: { ...config.buddy, cloudTtsEnabled: false } })
  })
  const voice = admin.locator('[data-check="voice"]')
  await voice.getByRole('button', { name: 'Test sound' }).click()
  const state = voice.locator('[data-check-status]')
  await expect(state).toHaveAttribute('data-check-status', /^(played|unavailable)$/, {
    timeout: 15_000
  })
  test.skip(
    (await state.getAttribute('data-check-status')) === 'unavailable',
    'No Windows voice on this machine'
  )
  await expect(admin.locator('[data-status="sound"]')).toHaveText(
    'Nobody has confirmed hearing a test sound yet.'
  )
  await voice.getByRole('button', { name: 'I heard it' }).click()
  await expect(admin.locator('[data-status="sound"]')).toHaveText(
    /^Last confirmed heard today at .*, using the Windows voice\.$/
  )
  const saved = JSON.parse(await readFile(join(folder, 'health-record.json'), 'utf8'))
  expect(saved.soundHeard).toMatchObject({ path: 'windows' })
})

test('only an unlocked caregiver can read it', async () => {
  await admin.getByRole('button', { name: 'Lock', exact: true }).click()
  await expect(
    admin
      .evaluate(() => window.admin.getHealthSummary())
      .then(
        () => 'read',
        () => 'refused'
      )
  ).resolves.toBe('refused')
})

test('closing GrammieGuide is recorded as on purpose, and the history survives', async () => {
  await app.close()
  await launch()
  await unlock(false)
  await expect(row('GrammieGuide closed on purpose')).toHaveText(/^once, most recently today/)
  await expect(row('GrammieGuide stopped unexpectedly')).toHaveText(/^once, most recently/)
  await expect(row('Computer lost power or was forced off')).toHaveText(/^once, most recently/)
  const saved = JSON.parse(await readFile(join(folder, 'health-record.json'), 'utf8'))
  expect(saved.runs.map((run: { ending?: string }) => run.ending ?? null)).toEqual([
    'power-loss',
    'stopped-unexpectedly',
    'closed',
    null
  ])
  expect(errors).toEqual([])
})
