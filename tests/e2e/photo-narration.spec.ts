import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page, Locator } from 'playwright'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { defaultConfig } from '../../src/shared/configSchema'

let app: ElectronApplication, page: Page, admin: Page, root: string, source: string
const first = randomUUID(),
  second = randomUUID(),
  song = randomUUID(),
  playlist = randomUUID()
const errors: string[] = []
test.describe.configure({ mode: 'serial' })
function wave(seconds: number): Buffer {
  const samples = seconds * 8000
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF')
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24)
  bytes.writeUInt32LE(16000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / 8000) * 1000), 44 + i * 2)
  return bytes
}
const card = (): Locator => admin.locator('.photo-editor').first()
const narration = (): Locator => page.locator('audio[data-narration-player]')
const music = (): Locator => page.locator('audio[data-music-player]')
async function openPhotos(): Promise<void> {
  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Photos', exact: true })).toBeVisible()
}
async function attach(): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = (async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }) as typeof original
  }, source)
  await card().getByRole('button', { name: 'Attach audio file…', exact: true }).click()
  await expect(card().getByRole('button', { name: 'Play story', exact: true })).toBeEnabled()
}
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-narration-'))
  const photos = join(root, 'media', 'photos'),
    tracks = join(root, 'media', 'music')
  mkdirSync(photos, { recursive: true })
  mkdirSync(tracks, { recursive: true })
  const picture = readFileSync('tests/fixtures/music/cover.png')
  const entries = [first, second].map((id, order) => {
    writeFileSync(join(photos, `${id}.jpg`), picture)
    writeFileSync(join(photos, `${id}.thumb.jpg`), picture)
    return {
      id,
      fileName: `${id}.jpg`,
      thumbFileName: `${id}.thumb.jpg`,
      metadata: { caption: `A familiar picture ${order + 1}`, showToHer: true, order }
    }
  })
  writeFileSync(join(photos, 'index.json'), JSON.stringify({ version: 1, entries }))
  writeFileSync(join(tracks, `${song}.wav`), wave(120))
  writeFileSync(
    join(tracks, 'index.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: song,
          fileName: `${song}.wav`,
          metadata: { title: 'Tone', artist: '', duration: 120 }
        }
      ]
    })
  )
  source = join(root, 'original-story.wav')
  writeFileSync(source, wave(45))
  const config = defaultConfig()
  config.buddy.motion = 'reduced'
  config.tiles = [
    {
      id: 'photos',
      label: 'Photos',
      type: 'builtin',
      builtinKey: 'photos',
      size: 'normal',
      slot: 0,
      colorIndex: 0
    },
    {
      id: 'music',
      label: 'Music',
      type: 'builtin',
      builtinKey: 'music',
      size: 'normal',
      slot: 1,
      colorIndex: 1
    }
  ]
  config.music.playlists = [{ id: playlist, label: 'Favorites', trackIds: [song], shuffle: false }]
  writeFileSync(join(root, 'grammieguide-config.json'), JSON.stringify(config))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${root}`, '--use-fake-device-for-media-stream'],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  const opened = app.waitForEvent('window')
  await app.evaluate(() =>
    (
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  )
  admin = await opened
  admin.on('pageerror', (error) => errors.push(error.message))
  await admin.waitForLoadState('domcontentloaded')
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root && dirname(root) === tmpdir() && basename(root).startsWith('grammieguide-narration-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
test('denies microphone outside unlocked admin and denies camera even inside admin', async () => {
  const access = async (target: Page, video = false): Promise<boolean> =>
    target.evaluate(async (camera) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          camera ? { video: true } : { audio: true }
        )
        stream.getTracks().forEach((track) => track.stop())
        return true
      } catch {
        return false
      }
    }, video)
  expect(await access(page)).toBe(false)
  expect(await access(admin)).toBe(false)
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
  expect(await access(admin, true)).toBe(false)
})
test('records real microphone audio, previews it, and cancels an unfinished re-record on leaving', async () => {
  await admin.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      ;(window as unknown as { captureTracks: MediaStreamTrack[] }).captureTracks =
        stream.getTracks()
      return stream
    }
  })
  await card().getByRole('button', { name: 'Record story', exact: true }).click()
  await expect(card().getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible()
  await admin.waitForTimeout(1300)
  await card().getByRole('button', { name: 'Stop recording', exact: true }).click()
  await expect(card().getByRole('button', { name: 'Play story', exact: true })).toBeEnabled()
  await card().getByRole('button', { name: 'Play story', exact: true }).click()
  await expect
    .poll(() =>
      admin
        .locator('audio[data-narration-player]')
        .evaluate((audio: HTMLAudioElement) => audio.currentTime)
    )
    .toBeGreaterThan(0)
  await card().getByRole('button', { name: 'Stop preview', exact: true }).click()
  await card().getByRole('button', { name: 'Re-record story', exact: true }).click()
  await expect(card().getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Display', exact: true }).click()
  expect(
    await admin.evaluate(() =>
      (window as unknown as { captureTracks: MediaStreamTrack[] }).captureTracks.every(
        (track) => track.readyState === 'ended'
      )
    )
  ).toBe(true)
  await admin.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(card().getByRole('button', { name: 'Play story', exact: true })).toBeEnabled()
})
test('attaches a file, plays offline on demand, holds music and stops on paging and Home', async () => {
  await attach()
  await page.context().setOffline(true)
  await expect(card().getByLabel('Play story automatically')).not.toBeChecked()
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await page.getByRole('button', { name: /Favorites.*Play/ }).click()
  await expect
    .poll(() => music().evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await openPhotos()
  await expect(narration()).toHaveCount(0)
  await page.getByRole('button', { name: 'Listen to the story', exact: true }).click()
  await expect
    .poll(() => narration().evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0)
  await expect.poll(() => music().evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await page.getByRole('button', { name: 'Next photo', exact: true }).click()
  await expect(narration()).toHaveCount(0)
  await expect.poll(() => music().evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  await page.getByRole('button', { name: 'Previous photo', exact: true }).click()
  await page.getByRole('button', { name: 'Listen to the story', exact: true }).click()
  await expect(narration()).toHaveCount(1)
  await page.getByRole('button', { name: '🏠 Home', exact: true }).click()
  await expect(narration()).toHaveCount(0)
  expect(readFileSync(source)).toEqual(wave(45))
})
test('autoplay is opt-in, waits for the photo and fits at every text size; removing it stops playback', async () => {
  await card().getByLabel('Play story automatically').click()
  await expect(card().getByLabel('Play story automatically')).toBeChecked()
  await expect(card().getByLabel('Play story automatically')).toBeEnabled()
  await openPhotos()
  await expect
    .poll(() => narration().evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0)
  for (let fontStep = 0; fontStep < 5; fontStep++) {
    await admin.evaluate(async (step) => {
      const config = await window.admin.getConfig()
      await window.admin.setConfig({ display: { ...config.display, fontStep: step } })
    }, fontStep)
    await expect
      .poll(() =>
        page
          .locator('.photo-viewer-picture')
          .evaluate((node) => node.getBoundingClientRect().height)
      )
      .toBeGreaterThan(80)
    for (const name of ['🏠 Home', 'Stop story', 'Next photo'])
      await expect(page.getByRole('button', { name, exact: true })).toBeInViewport()
  }
  await page.screenshot({ path: 'test-results/photo-narration-viewer.png' })
  await admin.screenshot({ path: 'test-results/photo-narration-admin.png' })
  admin.once('dialog', (dialog) => dialog.accept())
  await card().getByRole('button', { name: 'Delete story', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Listen to the story', exact: true })).toHaveCount(
    0
  )
  await expect(narration()).toHaveCount(0)
  const log = JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog()))
  expect(log).not.toContain('A familiar picture')
  expect(log).not.toContain('original-story')
  expect(errors).toEqual([])
})

test('locking the caregiver panel ends microphone capture and releases the music hold', async () => {
  await card().getByRole('button', { name: 'Record story', exact: true }).click()
  await expect(card().getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Lock', exact: true }).click()
  await expect
    .poll(() =>
      admin.evaluate(() =>
        (window as unknown as { captureTracks: MediaStreamTrack[] }).captureTracks.every(
          (track) => track.readyState === 'ended'
        )
      )
    )
    .toBe(true)
  await expect.poll(() => music().evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  expect(errors).toEqual([])
})
