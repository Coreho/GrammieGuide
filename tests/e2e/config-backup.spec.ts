import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

let app: ElectronApplication
let home: Page
let admin: Page
let userData: string
let backupPath: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'grammieguide-backup-'))
  backupPath = join(userData, 'settings-backup.json')
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  home = await app.firstWindow()
  await home.waitForLoadState('domcontentloaded')
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
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Home Screen Tiles' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  if (userData) rmSync(userData, { recursive: true, force: true, maxRetries: 3 })
})

async function pickSave(): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showSaveDialog
    dialog.showSaveDialog = async () => {
      dialog.showSaveDialog = original
      return { canceled: false, filePath: path }
    }
  }, backupPath)
}

async function pickRestore(): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }
  }, backupPath)
}

test('caregiver saves and restores settings, rejects bad files, and sees media as not set up', async () => {
  const source = defaultConfig()
  source.display.fontStep = 3
  source.tiles = [
    {
      id: 'family',
      label: 'Family',
      type: 'web',
      url: 'https://example.com',
      size: 'wide',
      colorIndex: 3
    },
    {
      id: 'photos',
      label: 'Our photos',
      type: 'builtin',
      builtinKey: 'photos',
      size: 'normal',
      colorIndex: 0
    },
    {
      id: 'music',
      label: 'Her music',
      type: 'builtin',
      builtinKey: 'music',
      size: 'normal',
      colorIndex: 1
    }
  ]
  await admin.evaluate(async (config) => {
    await window.admin.setConfig(config)
    await window.admin.setApiKey('source-key')
  }, source)
  await admin.getByRole('button', { name: 'Reliability', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Settings backup and restore' })).toBeVisible()
  await expect(admin.getByText(/Photo and music files are not included/)).toBeVisible()
  await pickSave()
  await admin.getByRole('button', { name: 'Save backup', exact: true }).click()
  await expect(admin.getByRole('status')).toHaveText('Backup saved.')
  const backupText = readFileSync(backupPath, 'utf8')
  expect(backupText).toMatch(/Photo and music files are not included/)
  expect(backupText).not.toMatch(/source-key|anthropicApiKey|adminPinHash|adminPinSalt/)
  const saved = JSON.parse(backupText)
  expect(saved.config.tiles).toEqual(source.tiles)
  expect(saved.config.display.fontStep).toBe(3)

  // Simulate another device: no media folders and different local settings/secrets.
  await admin.evaluate(async () => {
    await window.admin.setConfig({
      tiles: [],
      display: { fontStep: 1, theme: 'tilesBold', ambientBackground: true, volumeCeiling: 70 }
    })
    await window.admin.setApiKey('destination-key')
  })
  await pickRestore()
  await admin.getByRole('button', { name: 'Restore backup', exact: true }).click()
  await expect(admin.getByRole('status')).toContainText('Settings restored.')
  await expect(home.getByRole('button', { name: 'Family', exact: true })).toBeVisible()
  await expect
    .poll(() => home.evaluate(() => window.launcher.getConfig().then((c) => c.display.fontStep)))
    .toBe(3)
  await admin.getByRole('button', { name: 'Tiles', exact: true }).click()
  await expect(admin.getByRole('button', { name: 'Edit Family', exact: true })).toBeVisible()
  await expect(
    admin.getByRole('list', { name: 'Configured tiles' }).getByRole('listitem')
  ).toHaveCount(3)
  const stored = JSON.parse(readFileSync(join(userData, 'grammieguide-config.json'), 'utf8'))
  expect(stored.buddy.anthropicApiKey).toBe('destination-key')
  expect(stored.reliability.adminPinHash).toBeTruthy()
  for (const label of ['Our photos', 'Her music']) {
    await home.getByRole('button', { name: label, exact: true }).click()
    await expect(home.getByText(`${label} is not set up yet.`, { exact: true })).toBeVisible()
    await home.getByRole('button', { name: 'Back to Home', exact: true }).click()
  }

  await admin.getByRole('button', { name: 'Reliability', exact: true }).click()
  writeFileSync(backupPath, '{broken')
  await pickRestore()
  await admin.getByRole('button', { name: 'Restore backup', exact: true }).click()
  await expect(admin.getByRole('status')).toContainText('not a valid GrammieGuide settings backup')
  expect(JSON.parse(readFileSync(join(userData, 'grammieguide-config.json'), 'utf8'))).toEqual(
    stored
  )
  await admin.evaluate(() => window.admin.lock())
  await expect(admin.evaluate(() => window.admin.saveBackup())).rejects.toThrow(
    'admin unlock required'
  )
  await expect(admin.evaluate(() => window.admin.restoreBackup())).rejects.toThrow(
    'admin unlock required'
  )
  expect(await admin.evaluate(() => window.admin.unlock('2468'))).toMatchObject({ ok: true })
})
