import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page, Locator } from 'playwright'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'
import type { LibraryEntry } from '../../src/shared/media/libraryTypes'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
let server: Server
let url: string
const errors: string[] = []
const first = randomUUID(),
  second = randomUUID(),
  missing = randomUUID(),
  missing2 = randomUUID()
const favorites = randomUUID(),
  unavailable = randomUUID()
test.describe.configure({ mode: 'serial' })

function wave(seconds = 8): Buffer {
  const rate = 8000,
    samples = rate * seconds
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF')
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / rate) * 1000), 44 + i * 2)
  return bytes
}

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
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
const player = (): Locator => page.locator('audio[data-music-player]')
async function openMusic(): Promise<void> {
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Music', exact: true })).toBeVisible()
}
async function chooseFavorites(): Promise<void> {
  await page.getByRole('button', { name: /Favorites.*Play/ }).click()
  await expect
    .poll(() =>
      player().evaluate((audio: HTMLAudioElement) => ({
        paused: audio.paused,
        time: audio.currentTime,
        src: audio.currentSrc
      }))
    )
    .toMatchObject({ paused: false, src: `grammie-media://music/${first}.wav` })
  await expect
    .poll(() => player().evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.05)
}

test.beforeAll(async () => {
  const sound = wave()
  server = createServer((request, response) => {
    if (request.url === '/sound.wav') {
      response.setHeader('Content-Type', 'audio/wav')
      response.end(sound)
      return
    }
    response.setHeader('Content-Type', 'text/html')
    response.end(
      '<!doctype html><title>Page sound fixture</title><audio id="a" src="/sound.wav" loop></audio><button onclick="a.play()">Play page sound</button><button onclick="a.pause()">Pause page sound</button>'
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  root = mkdtempSync(join(tmpdir(), 'grammieguide-music-player-'))
  const folder = join(root, 'media', 'music')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, `${first}.wav`), sound)
  writeFileSync(join(folder, `${second}.wav`), wave(5))
  const entries: LibraryEntry[] = [first, second, missing, missing2].map((id, index) => ({
    id,
    fileName: `${id}.wav`,
    metadata: {
      title: ['First familiar song', 'Second familiar song', 'Missing song', 'Also missing'][
        index
      ]!,
      artist: 'Test fixture',
      durationMs: 8000
    }
  }))
  writeFileSync(join(folder, 'index.json'), JSON.stringify({ entries }))
  const config = defaultConfig()
  config.buddy.motion = 'still'
  config.buddy.voiceEnabled = false
  config.buddy.cloudTtsEnabled = false
  config.tiles = [
    {
      id: 'site',
      type: 'web',
      url,
      label: 'Page sound',
      icon: '🌐',
      slot: 0,
      size: 'normal',
      colorIndex: 0
    },
    {
      id: 'photos',
      type: 'builtin',
      builtinKey: 'photos',
      label: 'Photos',
      slot: 1,
      size: 'normal',
      colorIndex: 1
    }
  ]
  config.music.playlists = [
    { id: favorites, label: 'Favorites', shuffle: false, trackIds: [missing, first, second] },
    { id: unavailable, label: 'Old favorites', shuffle: false, trackIds: [missing, missing2] },
    { id: randomUUID(), label: 'One familiar song', shuffle: false, trackIds: [first] },
    { id: randomUUID(), label: 'Quiet afternoons', shuffle: true, trackIds: [first, second] },
    {
      id: randomUUID(),
      label: 'A few songs we enjoy listening to',
      shuffle: false,
      trackIds: [second]
    },
    { id: randomUUID(), label: 'Empty list', shuffle: false, trackIds: [] }
  ]
  writeFileSync(join(root, 'grammieguide-config.json'), JSON.stringify(config))
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('caregiver creates the Music tile; she plays offline, skips a missing song, and repeated card taps do nothing', async () => {
  await admin.getByLabel('Tile type').selectOption('builtin')
  await admin.getByLabel('Built-in feature').selectOption({ label: 'Music' })
  await expect(admin.getByLabel('Tile label')).toHaveValue('Music')
  await admin.getByRole('button', { name: 'Add Tile', exact: true }).click()
  await page.context().setOffline(true)
  await openMusic()
  await chooseFavorites()
  await expect(page.getByRole('button', { name: /Favorites.*Selected/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  const before = await player().evaluate((audio: HTMLAudioElement) => audio.currentTime)
  await page.getByRole('button', { name: /Favorites.*Selected/ }).click()
  expect(
    await player().evaluate((audio: HTMLAudioElement) => audio.currentTime)
  ).toBeGreaterThanOrEqual(before)
  await page.getByRole('button', { name: 'Next song →', exact: true }).click()
  await expect
    .poll(() => player().evaluate((audio: HTMLAudioElement) => audio.currentSrc))
    .toBe(`grammie-media://music/${second}.wav`)
  const logs = await admin.evaluate(() => window.admin.getActivityLog())
  expect(
    logs.filter((item) => item.type === 'music-play' && item.detail === favorites)
  ).toHaveLength(1)
  expect(JSON.stringify(logs)).not.toMatch(/First familiar song|Second familiar song|Missing song/)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(page.locator('.music-chip')).toBeVisible()
  expect(await player().evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  await page.getByRole('button', { name: 'Stop music', exact: true }).click()
  await expect(page.locator('.music-chip')).toHaveCount(0)
  expect(await player().evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await page.context().setOffline(false)
})

test('all-missing playlists dim calmly, while manual pause survives leaving the view', async () => {
  await openMusic()
  await page.getByRole('button', { name: /Old favorites.*Play/ }).click()
  const bad = page.getByRole('button', { name: /Old favorites.*Not available right now/ })
  await expect(bad).toBeDisabled()
  await expect(
    page.getByRole('button', { name: /Empty list.*Not available right now/ })
  ).toBeDisabled()
  await chooseFavorites()
  await page.getByRole('button', { name: 'Ⅱ Pause music', exact: true }).click()
  await expect(player()).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(page.locator('.music-chip')).toContainText('Music paused')
  await openMusic()
  await page.getByRole('button', { name: '▶ Play music', exact: true }).click()
  await expect(player()).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: '■ Stop music', exact: true }).click()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('Buddy chat and voice use the shared rule, and Stop remains available over chat and Photos', async () => {
  await openMusic()
  await chooseFavorites()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      buddy: { ...cfg.buddy, tapAction: 'chat', voiceEnabled: false }
    })
  })
  await page.locator('[data-buddy-tap]').click()
  await expect
    .poll(() =>
      page.evaluate(() => window.launcher.getAudio().then((state) => state.decision.music))
    )
    .toBe('held')
  await expect(player()).toHaveJSProperty('paused', true)
  await expect(page.getByRole('button', { name: '■ Stop music', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  await expect(player()).toHaveJSProperty('paused', false, { timeout: 6000 })
  const voice = readFileSync(resolve('tests/fixtures/music/tone.mp3')).toString('base64')
  await app.evaluate(({ ipcMain }, bytes) => {
    ipcMain.removeHandler('buddy:speak')
    ipcMain.handle('buddy:speak', () => ({ ok: true, audioBase64: bytes, mime: 'audio/mpeg' }))
  }, voice)
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      buddy: { ...cfg.buddy, tapAction: 'reaction', voiceEnabled: true }
    })
  })
  await page.locator('[data-buddy-tap]').click()
  await expect.poll(() => player().evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(0.25)
  await expect
    .poll(() => player().evaluate((audio: HTMLAudioElement) => audio.volume), { timeout: 6000 })
    .toBe(1)
  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await page.getByRole('button', { name: '■ Stop music', exact: true }).click()
  await expect(player()).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('page sound holds music, caregiver voice mutes the page, and the nav Stop ends music for good', async () => {
  await openMusic()
  await chooseFavorites()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await page.getByRole('button', { name: 'Page sound', exact: true }).click()
  const web = await expect
    .poll(() =>
      app
        .context()
        .pages()
        .find((candidate) => candidate.url() === url)
        ?.url()
    )
    .toBe(url)
    .then(() =>
      app
        .context()
        .pages()
        .find((candidate) => candidate.url() === url)!
    )
  await web.getByRole('button', { name: 'Play page sound', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.launcher.getAudio().then((state) => state.decision.music))
    )
    .toBe('held')
  await expect(player()).toHaveJSProperty('paused', true)
  const voice = readFileSync(resolve('tests/fixtures/music/tone.mp3')).toString('base64')
  await app.evaluate(({ ipcMain }, bytes) => {
    ipcMain.removeHandler('buddy:speak')
    ipcMain.handle('buddy:speak', () => ({ ok: true, audioBase64: bytes, mime: 'audio/mpeg' }))
  }, voice)
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await admin.getByRole('button', { name: 'Try this voice', exact: true }).click()
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }, address) =>
          webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === address)
            ?.isAudioMuted(),
        url
      )
    )
    .toBe(true)
  await expect
    .poll(
      () =>
        app.evaluate(
          ({ webContents }, address) =>
            webContents
              .getAllWebContents()
              .find((contents) => contents.getURL() === address)
              ?.isAudioMuted(),
          url
        ),
      { timeout: 6000 }
    )
    .toBe(false)
  await web.getByRole('button', { name: 'Pause page sound', exact: true }).click()
  await expect(player()).toHaveJSProperty('paused', false, { timeout: 6000 })
  await page.getByRole('button', { name: '■ Stop music', exact: true }).click()
  await expect(page.getByRole('button', { name: '■ Stop music', exact: true })).toHaveCount(0)
  await expect(player()).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
})

test('listening reports a microphone hold and releases it when the phrase request completes', async () => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('buddy:canListen')
    ipcMain.handle('buddy:canListen', () => true)
    ipcMain.removeHandler('buddy:listen')
    ipcMain.handle(
      'buddy:listen',
      () =>
        new Promise((resolve) => {
          ;(
            globalThis as unknown as { finishMusicListen: (result: unknown) => void }
          ).finishMusicListen = resolve
        })
    )
  })
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      buddy: { ...cfg.buddy, voiceEnabled: false, tapAction: 'chat' }
    })
  })
  await openMusic()
  await chooseFavorites()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await page.locator('[data-buddy-tap]').click()
  await page.getByRole('button', { name: 'Talk to Buddy out loud', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.launcher.getAudio().then((state) => state.decision)))
    .toMatchObject({ music: 'held', muteWebPage: true })
  await expect(player()).toHaveJSProperty('paused', true)
  await app.evaluate(() => {
    ;(globalThis as unknown as { finishMusicListen: (result: unknown) => void }).finishMusicListen({
      ok: false,
      reason: 'no-mic'
    })
  })
  await expect
    .poll(() =>
      page.evaluate(() => window.launcher.getAudio().then((state) => state.decision.muteWebPage))
    )
    .toBe(false)
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  await expect(player()).toHaveJSProperty('paused', false, { timeout: 6000 })
  await page.getByRole('button', { name: 'Stop music', exact: true }).click()
})

test('the caregiver can hide the chip without hiding Stop, and controls fit every font step', async () => {
  test.setTimeout(120_000)
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({ music: { ...cfg.music, showNowPlayingChip: false } })
  })
  await openMusic()
  await chooseFavorites()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(page.locator('.music-chip strong')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Stop music', exact: true })).toBeVisible()
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({ music: { ...cfg.music, showNowPlayingChip: true } })
  })
  await page.evaluate(() => {
    const original = Date.prototype.toLocaleDateString
    ;(window as unknown as { originalMusicDate: typeof original }).originalMusicDate = original
    Date.prototype.toLocaleDateString = function (locales, options) {
      return options?.weekday
        ? 'Wednesday'
        : options?.month
          ? 'September 30'
          : original.call(this, locales, options)
    }
  })
  try {
    for (const dimensions of [
      { width: 1264, height: 760 },
      { width: 1440, height: 900 }
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height),
        dimensions
      )
      await openMusic()
      for (let fontStep = 0; fontStep < 5; fontStep++) {
        await admin.evaluate(async (step) => {
          const cfg = await window.admin.getConfig()
          await window.admin.setConfig({ display: { ...cfg.display, fontStep: step } })
        }, fontStep)
        await expect
          .poll(() =>
            page.locator('.music-card').evaluateAll((cards) =>
              cards
                .map((card) => ({
                  fits:
                    card.scrollWidth <= card.clientWidth + 1 &&
                    card.scrollHeight <= card.clientHeight + 1,
                  inside:
                    card.getBoundingClientRect().bottom <= innerHeight &&
                    card.getBoundingClientRect().right <= innerWidth
                }))
                .every((item) => item.fits && item.inside)
            )
          )
          .toBe(true)
        const controls = await page.locator('.music-actions button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const box = button.getBoundingClientRect()
            return box.height >= 80 && box.bottom <= innerHeight && box.right <= innerWidth
          })
        )
        expect(controls.every(Boolean)).toBe(true)
      }
      await page.screenshot({ path: `test-results/music-player-${dimensions.width}.png` })
      await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
      const fit = await page.locator('[data-home-now-playing-slot]').evaluate((slot) => {
        const parent = slot.parentElement!
        return (
          parent.scrollWidth <= parent.clientWidth + 1 &&
          parent.scrollHeight <= parent.clientHeight + 1
        )
      })
      expect(fit).toBe(true)
      await page.screenshot({ path: `test-results/music-chip-${dimensions.width}.png` })
    }
  } finally {
    await page.evaluate(() => {
      Date.prototype.toLocaleDateString = (
        window as unknown as { originalMusicDate: typeof Date.prototype.toLocaleDateString }
      ).originalMusicDate
    })
    await admin.evaluate(async () => {
      const cfg = await window.admin.getConfig()
      await window.admin.setConfig({ display: { ...cfg.display, fontStep: 1 } })
    })
    await page.getByRole('button', { name: 'Stop music', exact: true }).click()
  }
})

test('the auto-stop deadline stops playback and logs only the playlist ID', async () => {
  await page.clock.install()
  // Start a fresh document so every application timer belongs to the installed clock.
  await page.reload()
  await openMusic()
  await chooseFavorites()
  await page.clock.fastForward(90 * 60_000)
  await expect(player()).toHaveJSProperty('paused', true)
  const logs = await admin.evaluate(() => window.admin.getActivityLog())
  expect(logs.some((item) => item.type === 'music-autostop' && item.detail === favorites)).toBe(
    true
  )
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  expect(errors).toEqual([])
})

test('recovering a crashed Home renderer stops music and leaves no stale hold or Stop button', async () => {
  await openMusic()
  await chooseFavorites()
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('/launcher/')
    )!.webContents
    const loaded = new Promise<void>((resolve) => contents.once('did-finish-load', () => resolve()))
    contents.forcefullyCrashRenderer()
    await loaded
  })
  // Chromium destroys the old Playwright page handle. Probe the new document
  // through the surviving real WebContents, as the Home recovery suite does.
  await expect
    .poll(
      () =>
        app.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().includes('/launcher/')
          )!.webContents.executeJavaScript(`
        (async () => {
          const audio = document.querySelector('audio[data-music-player]')
          return {
            musicTile: Boolean(document.querySelector('button[aria-label="Music"]')),
            paused: audio?.paused,
            stop: Boolean(document.querySelector('.music-chip button')),
            decision: (await window.launcher.getAudio()).decision
          }
        })()
      `)
        }),
      { timeout: 15_000 }
    )
    .toMatchObject({
      musicTile: true,
      paused: true,
      stop: false,
      decision: { music: 'off', showStopMusic: false, muteWebPage: false }
    })
})
