import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MEDIA_LIBRARY_FOLDERS } from '../../src/main/services/media/libraryPaths'

let app: ElectronApplication
let launcher: Page
let admin: Page
let userData: string
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=',
  'base64'
)

function silentWav(): Buffer {
  const samples = 16_000
  const wav = Buffer.alloc(44 + samples, 128)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8_000, 24)
  wav.writeUInt32LE(8_000, 28)
  wav.writeUInt16LE(1, 32)
  wav.writeUInt16LE(8, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples, 40)
  return wav
}

const wav = silentWav()
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'grammieguide-media-'))
  for (const folder of Object.values(MEDIA_LIBRARY_FOLDERS)) {
    mkdirSync(join(userData, folder), { recursive: true })
  }
  const photos = join(userData, MEDIA_LIBRARY_FOLDERS.photos)
  writeFileSync(join(photos, 'photo.png'), png)
  writeFileSync(join(photos, 'narration.wav'), wav)
  writeFileSync(join(photos, 'unsupported.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(photos, 'empty.png'), '')
  mkdirSync(join(photos, 'directory.png'))
  writeFileSync(join(userData, MEDIA_LIBRARY_FOLDERS.music, 'audio.wav'), wav)
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  launcher = await app.firstWindow()
  await launcher.waitForLoadState('domcontentloaded')
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

async function fetchMedia(
  url: string,
  range?: string,
  method = 'GET'
): Promise<{
  status: number
  headers: Record<string, string>
  bytes: number[]
}> {
  return app.evaluate(
    async ({ net }, input) => {
      const response = await net.fetch(input.url, {
        method: input.method,
        headers: input.range === undefined ? {} : { Range: input.range }
      })
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        bytes: Array.from(new Uint8Array(await response.arrayBuffer()))
      }
    },
    { url, range, method }
  )
}

for (const surface of ['launcher', 'admin'] as const) {
  test(`${surface} loads photos, plays and seeks audio, and restricts protocol CSP to img/media`, async () => {
    const page = surface === 'launcher' ? launcher : admin
    const result = await page.evaluate(
      async (audioUrl) => {
        const img = document.createElement('img')
        img.src = 'grammie-media://photos/photo.png'
        document.body.append(img)
        await img.decode()
        const imageWidth = img.naturalWidth
        img.remove()

        const audio = document.createElement('audio')
        audio.muted = true
        audio.src = audioUrl
        document.body.append(audio)
        try {
          await audio.play()
          const duration = audio.duration
          await new Promise<void>((resolve, reject) => {
            audio.addEventListener('seeked', () => resolve(), { once: true })
            audio.addEventListener('error', () => reject(new Error('audio failed')), { once: true })
            audio.currentTime = 1
          })
          return { imageWidth, duration, seekTime: audio.currentTime, paused: audio.paused }
        } finally {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
          audio.remove()
        }
      },
      surface === 'launcher'
        ? 'grammie-media://music/audio.wav'
        : 'grammie-media://photos/narration.wav'
    )
    expect(result.imageWidth).toBe(1)
    expect(result.duration).toBe(2)
    expect(result.seekTime).toBeGreaterThanOrEqual(1)
    expect(result.paused).toBe(false)

    const directives = await page.evaluate(() => {
      const policy = document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')!
        .getAttribute('content')!
      return policy
        .split(';')
        .filter((directive) => directive.includes('grammie-media:'))
        .map((directive) => directive.trim().split(' ')[0])
    })
    expect(directives.sort()).toEqual(['img-src', 'media-src'])
    const fetchBlocked = await page.evaluate(async () => {
      try {
        await fetch('grammie-media://photos/photo.png')
        return false
      } catch {
        return true
      }
    })
    expect(fetchBlocked).toBe(true)
  })
}

test('serves the complete file and HEAD with correct content headers', async () => {
  const response = await fetchMedia('grammie-media://photos/photo.png')
  expect(response.status).toBe(200)
  expect(response.bytes).toEqual(Array.from(png))
  expect(response.headers['content-type']).toBe('image/png')
  expect(response.headers['content-length']).toBe(String(png.length))
  expect(response.headers['accept-ranges']).toBe('bytes')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  const head = await fetchMedia('grammie-media://music/audio.wav', undefined, 'HEAD')
  expect(head.status).toBe(200)
  expect(head.headers['content-type']).toBe('audio/wav')
  expect(head.headers['content-length']).toBe(String(wav.length))
  expect(head.bytes).toEqual([])
  const empty = await fetchMedia('grammie-media://photos/empty.png')
  expect(empty.status).toBe(200)
  expect(empty.headers['content-length']).toBe('0')
  expect(empty.bytes).toEqual([])
})

test('returns exact bytes and headers for bounded, open-ended and suffix ranges', async () => {
  for (const [range, start, end] of [
    ['bytes=4-13', 4, 13],
    [`bytes=${wav.length - 10}-`, wav.length - 10, wav.length - 1],
    ['bytes=-10', wav.length - 10, wav.length - 1],
    [`bytes=${wav.length - 5}-${wav.length + 100}`, wav.length - 5, wav.length - 1]
  ] as const) {
    const response = await fetchMedia('grammie-media://music/audio.wav', range)
    expect(response.status).toBe(206)
    expect(response.headers['content-type']).toBe('audio/wav')
    expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/${wav.length}`)
    expect(response.headers['content-length']).toBe(String(end - start + 1))
    expect(response.headers['accept-ranges']).toBe('bytes')
    expect(response.bytes).toEqual(Array.from(wav.subarray(start, end + 1)))
  }
})

test('returns 416 for unsatisfiable, malformed and multiple ranges', async () => {
  for (const range of [`bytes=${wav.length}-`, 'bytes=9-2', 'bytes=0-1,4-5', 'invalid']) {
    const response = await fetchMedia('grammie-media://music/audio.wav', range)
    expect(response.status).toBe(416)
    expect(response.headers['content-range']).toBe(`bytes */${wav.length}`)
    expect(response.bytes).toEqual([])
  }
})

test('returns private 404s for bad names, unknown libraries, unsupported types and missing files', async () => {
  for (const url of [
    'grammie-media://photos/',
    'grammie-media://photos/a/b.png',
    'grammie-media://photos/%2e%2e%2fphoto.png',
    'grammie-media://photos/a%5cb.png',
    'grammie-media://photos/a%252fb.png',
    'grammie-media://photos/CON.png',
    'grammie-media://photos/a%20b.png',
    'grammie-media://photos/photo.png.',
    'grammie-media://photos/unsupported.svg',
    'grammie-media://photos/directory.png',
    'grammie-media://photos/missing-private-photo.png',
    'grammie-media://news-cache/photo.png',
    'grammie-media://unknown/photo.png'
  ]) {
    const response = await fetchMedia(url)
    expect(response.status, url).toBe(404)
    expect(response.bytes).toEqual([])
  }
  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(log.some((event) => event.type === 'media-unavailable')).toBe(true)
  expect(JSON.stringify(log)).not.toContain('missing-private-photo')
  expect(JSON.stringify(log)).not.toContain(userData)
})

test('admin library bridge gates access, imports a playable copy, updates and removes it', async () => {
  await admin.evaluate(() => window.admin.lock())
  await expect(
    admin.evaluate(() => window.admin.listLibrary({ library: 'photos' }))
  ).rejects.toThrow('admin unlock required')
  await admin.evaluate(() => window.admin.unlock('2468'))
  expect(await admin.evaluate(() => window.admin.listLibrary({ library: 'photos' }))).toEqual([])

  // Stand in for the native picker; import still goes through the real preload, IPC and disk store.
  await app.evaluate(
    ({ dialog }, source) => {
      const original = dialog.showOpenDialog
      dialog.showOpenDialog = async () => {
        dialog.showOpenDialog = original
        return { canceled: false, filePaths: [source] }
      }
    },
    join(userData, MEDIA_LIBRARY_FOLDERS.photos, 'photo.png')
  )
  const entries = await admin.evaluate(() => window.admin.importLibrary({ library: 'photos' }))
  expect(entries).toHaveLength(1)
  const entry = entries[0]!
  expect(entry.fileName).toMatch(/^[0-9a-f-]{36}\.png$/)
  expect(JSON.stringify(entries)).not.toContain(userData)
  const url = `grammie-media://photos/${entry.fileName}`
  expect((await fetchMedia(url)).bytes).toEqual(Array.from(png))
  const updated = await admin.evaluate(
    (id) => window.admin.updateLibrary({ library: 'photos', id, patch: { caption: 'Family' } }),
    entry.id
  )
  expect(updated.metadata.caption).toBe('Family')
  expect(
    await admin.evaluate((id) => window.admin.removeLibrary({ library: 'photos', id }), entry.id)
  ).toBe(true)
  expect(await admin.evaluate(() => window.admin.listLibrary({ library: 'photos' }))).toEqual([])
  expect((await fetchMedia(url)).status).toBe(404)
  expect((await fetchMedia('grammie-media://photos/photo.png')).status).toBe(200)
})
