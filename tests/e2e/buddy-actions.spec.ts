import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

let app: ElectronApplication, page: Page, root: string
const song = randomUUID(),
  photo = randomUUID(),
  playlist = randomUUID()
const errors: string[] = []
test.describe.configure({ mode: 'serial' })
async function openChat(): Promise<void> {
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('menuitem', { name: "Let's chat" }).click()
  await expect(page.getByRole('button', { name: 'Play my music', exact: true })).toBeVisible()
}
async function ask(text: string): Promise<void> {
  await page.getByPlaceholder('Say something...').fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-buddy-actions-'))
  const music = join(root, 'media', 'music'),
    photos = join(root, 'media', 'photos')
  mkdirSync(music, { recursive: true })
  mkdirSync(photos, { recursive: true })
  copyFileSync(resolve('tests/fixtures/music/tone.wav'), join(music, `${song}.wav`))
  copyFileSync(resolve('tests/fixtures/music/cover.png'), join(photos, `${photo}.png`))
  writeFileSync(
    join(music, 'index.json'),
    JSON.stringify({
      entries: [
        {
          id: song,
          fileName: `${song}.wav`,
          metadata: { title: 'Private generated song', durationMs: 400 }
        }
      ]
    })
  )
  writeFileSync(
    join(photos, 'index.json'),
    JSON.stringify({
      entries: [
        {
          id: photo,
          fileName: `${photo}.png`,
          metadata: { caption: 'Private photo caption', showToHer: true, order: 0 }
        }
      ]
    })
  )
  const config = defaultConfig()
  config.buddy.voiceEnabled = false
  config.buddy.cloudTtsEnabled = false
  config.buddy.motion = 'still'
  config.music.playlists = [{ id: playlist, label: 'Favorites', shuffle: false, trackIds: [song] }]
  // The actions work from the libraries without needing extra Home tiles.
  config.tiles = []
  writeFileSync(join(root, 'grammieguide-config.json'), JSON.stringify(config))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('buddy:canListen')
    ipcMain.handle('buddy:canListen', () => true)
    ipcMain.removeHandler('buddy:listen')
    ipcMain.handle('buddy:listen', () => ({ ok: true, text: 'show my pictures' }))
  })
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
test('typed requests start real local music offline without an API key, then Stop is permanent', async () => {
  await app.context().setOffline(true)
  await openChat()
  await ask('Please play my music.')
  await expect(page.getByRole('button', { name: 'Close chat' })).toHaveCount(0)
  const audio = page.locator('audio[data-music-player]')
  await expect(audio).toHaveJSProperty('paused', false, { timeout: 12_000 })
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentSrc))
    .toBe(`grammie-media://music/${song}.wav`)
  await expect(page.locator('[data-toast]')).toHaveText('Your music is playing.')
  await page.getByRole('button', { name: 'Stop music', exact: true }).click()
  await expect(audio).toHaveJSProperty('paused', true)
})
test('spoken requests and the picture button open only approved photos, and Home returns to Home', async () => {
  await openChat()
  await page.getByRole('button', { name: 'Talk to Buddy out loud', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pictures', exact: true })).toBeVisible()
  await expect(page.getByText('Private photo caption')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Family photo' })).toHaveJSProperty('naturalWidth', 1)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openChat()
  await page.getByRole('button', { name: 'Show my pictures', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pictures', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openChat()
  await page.getByRole('button', { name: 'Go Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close chat' })).toHaveCount(0)
  await expect(page.locator('[data-toast]')).toHaveText('Here we are, back Home.')
})
test('missing music/photos get kind replies, rejected actions do nothing, and buttons fit every font size', async () => {
  rmSync(join(root, 'media', 'music', `${song}.wav`))
  rmSync(join(root, 'media', 'photos', `${photo}.png`))
  await openChat()
  await page.getByRole('button', { name: 'Play my music', exact: true }).click()
  await expect(
    page.getByText("Your music isn't ready yet. Your family can help set it up.")
  ).toBeVisible()
  await page.getByRole('button', { name: 'Show my pictures', exact: true }).click()
  await expect(
    page.getByText("Your pictures aren't ready yet. Your family can help add them.")
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.launcher.buddyAction('deleteFiles' as never))
  ).toMatchObject({ ok: false })
  await expect(page.locator('audio[data-music-player]')).toHaveJSProperty('paused', true)
  await expect(page.getByRole('dialog', { name: 'Pictures', exact: true })).toHaveCount(0)
  const adminWindow = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  const admin = await adminWindow
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  for (let step = 0; step < 5; step++) {
    await admin.evaluate(
      (fontStep) => window.admin.setConfig({ display: { fontStep } } as never),
      step
    )
    for (const name of ['Play my music', 'Show my pictures', 'Go Home']) {
      const button = page.getByRole('button', { name, exact: true })
      expect(
        await button.evaluate(
          (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight
        )
      ).toBe(true)
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(60)
    }
  }
  await page.screenshot({ path: 'test-results/buddy-actions-large-text.png' })
  const activity = await admin.evaluate(() => window.admin.getActivityLog())
  const raw = JSON.stringify(activity)
  expect(raw).not.toContain('Private generated song')
  expect(raw).not.toContain('Private photo caption')
  expect(raw).not.toContain('Please play my music')
  expect(errors).toEqual([])
})
