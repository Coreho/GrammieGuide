import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { MusicTrack } from '../../src/shared/music/musicTypes'

let app: ElectronApplication
let page: Page
let admin: Page
let root: string
let tracks: MusicTrack[]
const errors: string[] = []
const extensions = ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'wav']
test.describe.configure({ mode: 'serial' })

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

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'grammieguide-music-library-'))
  await launch()
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Music', exact: true }).click()
})
test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('imports six real audio formats, extracts tags, duration and JPEG art, and continues after a broken file', async () => {
  const paths = extensions.map((extension) => resolve(`tests/fixtures/music/tone.${extension}`))
  const originals = paths.map((path) => readFileSync(path))
  const broken = join(root, 'broken.mp3')
  writeFileSync(broken, 'not music')
  paths.splice(2, 0, broken)
  await app.evaluate(({ dialog }, files) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: files }
    }
  }, paths)
  await admin.getByRole('button', { name: 'Add music files…', exact: true }).click()
  await expect(admin.getByRole('status')).toContainText('6 imported, 1 failed.')
  await expect(
    admin.getByRole('list', { name: 'Imported songs' }).getByRole('listitem')
  ).toHaveCount(6)
  tracks = await admin.evaluate(() =>
    window.admin.getMusicLibrary().then((library) => library.tracks)
  )
  expect(tracks.map((track) => track.title)).toEqual([
    'Familiar test song',
    'Familiar test song',
    'tone',
    'Familiar test song',
    'Familiar test song',
    'Familiar test song'
  ])
  expect(tracks.every((track) => track.durationMs > 300 && track.durationMs < 900)).toBe(true)
  expect(tracks[0]!.artist).toBe('Test artist')
  expect(tracks[0]!.artUrl).toMatch(/^grammie-media:\/\/music\/[a-f0-9-]+\.thumb\.jpg$/)
  const cover = admin.getByRole('list', { name: 'Imported songs' }).locator('img')
  await expect(cover).toBeVisible()
  expect(await cover.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  const copied = await app.evaluate(
    async ({ net }, songs) =>
      Promise.all(
        songs.map(async (song) => {
          const response = await net.fetch(song.url)
          return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength }
        })
      ),
    tracks
  )
  expect(copied.every((copy, i) => copy.ok && copy.bytes === originals[i]!.byteLength)).toBe(true)
  extensions.forEach((extension, i) =>
    expect(readFileSync(resolve(`tests/fixtures/music/tone.${extension}`))).toEqual(originals[i])
  )
  expect(JSON.stringify(tracks)).not.toContain(root)
})

test('builds two ordered playlists, sets shuffle, auto-stop and chip settings through the Music tab', async () => {
  await admin.getByRole('button', { name: 'Add playlist', exact: true }).click()
  let playlist = admin.getByRole('region', { name: 'Playlist new', exact: true })
  // Sections without headings expose their aria label through the region role.
  await playlist.getByLabel('Playlist name', { exact: true }).fill('Favorites')
  playlist = admin.getByRole('region', { name: 'Playlist Favorites', exact: true })
  const choices = playlist.getByRole('group', { name: 'Choose songs' }).getByRole('checkbox')
  await choices.nth(0).check()
  await choices.nth(1).check()
  await choices.nth(2).check()
  await playlist.getByRole('button', { name: 'Move tone up', exact: true }).click()
  await playlist.getByLabel('Shuffle songs', { exact: true }).check()
  await admin.getByRole('button', { name: 'Add playlist', exact: true }).click()
  const second = admin.getByRole('region', { name: 'Playlist new', exact: true })
  await second.getByLabel('Playlist name', { exact: true }).fill('Quiet time')
  await admin
    .getByRole('region', { name: 'Playlist Quiet time', exact: true })
    .getByRole('group', { name: 'Choose songs' })
    .getByRole('checkbox')
    .nth(0)
    .check()
  await admin.getByLabel('Auto-stop after (minutes)', { exact: true }).fill('45')
  await admin.getByLabel('Show now-playing chip on Home', { exact: true }).uncheck()
  await admin.getByRole('button', { name: 'Save playlists and settings', exact: true }).click()
  await expect(admin.getByRole('status')).toHaveText('Playlists and music settings saved.')
  const settings = await admin.evaluate(() =>
    window.admin.getMusicLibrary().then((snapshot) => snapshot.settings)
  )
  expect(settings).toMatchObject({ autoStopMinutes: 45, showNowPlayingChip: false })
  expect(settings.playlists[0]).toMatchObject({
    label: 'Favorites',
    shuffle: true,
    trackIds: [tracks[0]!.id, tracks[2]!.id, tracks[1]!.id]
  })
  expect(settings.playlists[1]).toMatchObject({
    label: 'Quiet time',
    shuffle: false,
    trackIds: [tracks[0]!.id]
  })
  await admin.screenshot({ path: 'test-results/music-library-admin.png', fullPage: true })
})

test('limits playlists to six, removes a playlist, and rejects invalid settings without changing the saved configuration', async () => {
  for (let i = 0; i < 4; i++) {
    await admin.getByRole('button', { name: 'Add playlist', exact: true }).click()
    await admin
      .getByRole('region', { name: 'Playlist new', exact: true })
      .getByLabel('Playlist name', { exact: true })
      .fill(`List ${i + 3}`)
  }
  await expect(admin.getByRole('button', { name: 'Add playlist', exact: true })).toBeDisabled()
  await admin.getByRole('button', { name: 'Save playlists and settings', exact: true }).click()
  await expect(admin.getByRole('status')).toHaveText('Playlists and music settings saved.')
  expect(
    (await admin.evaluate(() => window.admin.getMusicLibrary())).settings.playlists
  ).toHaveLength(6)
  await admin
    .getByRole('region', { name: 'Playlist List 6', exact: true })
    .getByRole('button', { name: 'Remove playlist', exact: true })
    .click()
  await expect(admin.getByRole('button', { name: 'Add playlist', exact: true })).toBeEnabled()
  await admin.getByRole('button', { name: 'Save playlists and settings', exact: true }).click()
  await expect(admin.getByRole('status')).toHaveText('Playlists and music settings saved.')
  const before = readFileSync(join(root, 'grammieguide-config.json'), 'utf8')
  await admin.getByLabel('Auto-stop after (minutes)', { exact: true }).fill('9')
  await admin.getByRole('button', { name: 'Save playlists and settings', exact: true }).click()
  await expect(admin.getByRole('alert')).toContainText('Check the playlist')
  expect(readFileSync(join(root, 'grammieguide-config.json'), 'utf8')).toBe(before)
  await admin.getByLabel('Auto-stop after (minutes)', { exact: true }).fill('45')
})

test('removes a song and its cover from disk and every playlist while keeping originals', async () => {
  await admin.evaluate(() => {
    window.confirm = () => true
  })
  await admin
    .getByRole('button', { name: 'Remove song: Familiar test song', exact: true })
    .first()
    .click()
  await expect(admin.getByRole('status')).toContainText('Song removed')
  await expect(
    admin.getByRole('list', { name: 'Imported songs' }).getByRole('listitem')
  ).toHaveCount(5)
  const snapshot = await admin.evaluate(() => window.admin.getMusicLibrary())
  expect(snapshot.settings.playlists.every((list) => !list.trackIds.includes(tracks[0]!.id))).toBe(
    true
  )
  expect(snapshot.settings.playlists[0]!.trackIds).toEqual([tracks[2]!.id, tracks[1]!.id])
  expect(existsSync(join(root, 'media', 'music', `${tracks[0]!.id}.mp3`))).toBe(false)
  expect(existsSync(join(root, 'media', 'music', `${tracks[0]!.id}.thumb.jpg`))).toBe(false)
  expect(existsSync(resolve('tests/fixtures/music/tone.mp3'))).toBe(true)
})

test('persists library and playlists over restart and locks every music channel', async () => {
  await app.close()
  await launch()
  await admin.getByPlaceholder('PIN').fill('2468')
  await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
  await admin.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(
    admin.getByRole('list', { name: 'Imported songs' }).getByRole('listitem')
  ).toHaveCount(5)
  await expect(
    admin
      .getByRole('region', { name: 'Playlist Favorites', exact: true })
      .getByLabel('Shuffle songs')
  ).toBeChecked()
  await expect(admin.getByLabel('Auto-stop after (minutes)', { exact: true })).toHaveValue('45')
  await admin.getByRole('button', { name: 'Lock', exact: true }).click()
  const denied = await admin.evaluate(async () => {
    const results = await Promise.allSettled([
      window.admin.getMusicLibrary(),
      window.admin.importMusic(),
      window.admin.saveMusicSettings({
        playlists: [],
        autoStopMinutes: 90,
        showNowPlayingChip: true
      }),
      window.admin.removeMusicTrack('anything')
    ])
    return results.map((result) => result.status)
  })
  expect(denied).toEqual(Array(4).fill('rejected'))
  expect(
    await page.evaluate(
      () => 'importMusic' in window.launcher || 'removeMusicTrack' in window.launcher
    )
  ).toBe(false)
  expect(errors).toEqual([])
})
