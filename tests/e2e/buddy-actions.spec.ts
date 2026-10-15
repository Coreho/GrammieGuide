import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'
import { createServer, type ServerResponse } from 'node:http'

let app: ElectronApplication, page: Page, root: string
const song = randomUUID(),
  photo = randomUUID(),
  playlist = randomUUID()
const errors: string[] = []
const webServer = createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end()
    return
  }
  pendingPage = response
})
let pendingPage: ServerResponse | undefined
test.describe.configure({ mode: 'serial' })
async function openChat(): Promise<void> {
  // DOM ready precedes the config render and its shortcut effect on a cold launch.
  const buddy = page.getByRole('button', { name: 'Say hello to Buddy', exact: true })
  await expect(buddy).toBeVisible()
  await buddy.focus()
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('menuitem', { name: "Let's chat" }).click()
  await expect(page.getByRole('button', { name: 'Play my music', exact: true })).toBeVisible()
}
async function ask(text: string): Promise<void> {
  await page.getByPlaceholder('Say something...').fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}
test.beforeAll(async () => {
  await new Promise<void>((resolve) => webServer.listen(0, '127.0.0.1', resolve))
  const address = webServer.address() as { port: number }
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
  config.display.homeLayout = 'simple4'
  config.tiles = [
    {
      id: 'albums',
      label: 'Family Albums',
      type: 'builtin',
      builtinKey: 'photos',
      size: 'normal',
      slot: 0,
      colorIndex: 0
    },
    {
      id: 'weather-choice',
      label: 'My News',
      type: 'builtin',
      builtinKey: 'weather',
      size: 'normal',
      slot: 1,
      colorIndex: 1
    },
    {
      id: 'music-choice',
      label: 'My News',
      type: 'builtin',
      builtinKey: 'music',
      size: 'normal',
      slot: 2,
      colorIndex: 2
    },
    {
      id: 'web-choice',
      label: 'Local Paper',
      type: 'web',
      url: `http://127.0.0.1:${address.port}/`,
      size: 'normal',
      slot: 3,
      colorIndex: 3
    }
  ]
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
    ipcMain.handle('buddy:listen', () => ({ ok: true, text: 'go to Family Albums' }))
  })
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    webServer.closeAllConnections()
    await new Promise<void>((resolve) => webServer.close(() => resolve()))
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('typed saved tile requests open the same viewer offline and unknown targets stay calm', async () => {
  await app.context().setOffline(true)
  await openChat()
  await ask('Please open Family Albums.')
  await expect(page.getByRole('dialog', { name: 'Family Albums', exact: true })).toBeVisible()
  await expect(page.locator('[data-toast]')).toHaveText('Here it is.')
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openChat()
  await ask('open https://arbitrary.example')
  await expect(
    page.getByText("That choice isn't on Home right now. You can choose another one.")
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close chat' }).click()
})

test('ambiguous requests show choices without moving Home and open only the chosen tile', async () => {
  const before = await page.evaluate(async () => (await window.launcher.getConfig()).tiles)
  await openChat()
  await ask('show me My News')
  await expect(page.getByText('Which one would you like? Tap a choice below.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'My News — Row 1, position 2', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'My News — Row 2, position 1', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'My News', exact: true })).toHaveCount(0)
  expect(await page.evaluate(async () => (await window.launcher.getConfig()).tiles)).toEqual(before)
  await page.getByRole('button', { name: 'My News — Row 2, position 1', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'My News', exact: true })).toBeVisible()
  await expect(page.locator('[data-toast]')).toHaveText('Here it is.')
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('a web tile is confirmed only after loading, and a failed opening never claims success', async () => {
  await app.context().setOffline(false)
  await openChat()
  await ask('open Local Paper')
  await expect.poll(() => Boolean(pendingPage)).toBe(true)
  await expect(page.locator('[data-toast]').filter({ hasText: 'Here it is.' })).toHaveCount(0)
  pendingPage!.end('<html><body>Local saved site</body></html>')
  pendingPage = undefined
  await expect(page.locator('[data-toast]')).toHaveText('Here it is.')
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openChat()
  await ask('go to Local Paper')
  await expect.poll(() => Boolean(pendingPage)).toBe(true)
  pendingPage!.destroy()
  pendingPage = undefined
  // Chromium may retry a dropped connection; refuse every retry as well.
  webServer.removeAllListeners('request')
  webServer.on('request', (_req, response) => response.destroy())
  await expect(page.locator('[data-toast]')).toHaveText(
    "That didn't open just now. Let's try something else.",
    { timeout: 20_000 }
  )
  // The same friendly recovery screen as after a tap, with its Home button.
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close chat' })).toHaveCount(0)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).first().click()
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
  await expect(page.getByRole('dialog', { name: 'Family Albums', exact: true })).toBeVisible()
  await expect(page.getByText('Private photo caption')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Family photo' })).toHaveJSProperty('naturalWidth', 1)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openChat()
  await page.getByRole('button', { name: 'Show my pictures', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Family Albums', exact: true })).toBeVisible()
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
  expect(raw).not.toContain('Family Albums')
  expect(raw).not.toContain('My News')
  expect(raw).not.toContain('Local Paper')
  expect(errors).toEqual([])
})
