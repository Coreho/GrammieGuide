import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../../src/main/services/media/libraryStore'
import { PhotoNarration } from '../../src/main/services/photos/photoNarration'
import { libraryPaths } from '../../src/main/services/media/libraryPaths'

describe('managed photo narration', () => {
  let root: string, photos: LibraryStore, audio: LibraryStore, narration: PhotoNarration, id: string
  const validate = vi.fn(async () => {})
  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'grammie-narration-'))
    photos = new LibraryStore(root, 'photos')
    audio = new LibraryStore(root, 'narration')
    id = (await photos.addImage(Buffer.from('photo'), Buffer.from('thumb'), { showToHer: true })).id
    validate.mockClear()
    narration = new PhotoNarration(photos, audio, validate)
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })
  it('stores a generated copy, replaces it without losing autoplay, persists over restart and removes it', async () => {
    const first = await narration.save(id, Buffer.from('first'), '.webm')
    const folder = libraryPaths(root, 'narration').folder
    expect(await fs.readFile(join(folder, first.fileName), 'utf8')).toBe('first')
    expect(first.metadata.autoPlay).toBe(false)
    await narration.setAutoPlay(id, true)
    const second = await narration.save(id, Buffer.from('second'), '.wav')
    await expect(fs.stat(join(folder, first.fileName))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(second.metadata.autoPlay).toBe(true)
    const restarted = new PhotoNarration(
      new LibraryStore(root, 'photos'),
      new LibraryStore(root, 'narration'),
      validate
    )
    const decorated = await restarted.decorate([
      {
        id,
        url: 'photo',
        thumbnailUrl: 'thumb',
        caption: '',
        showToHer: true,
        order: 0,
        importIndex: 0
      }
    ])
    expect(decorated[0]!.narration).toEqual({
      url: `grammie-media://narration/${second.fileName}`,
      autoPlay: true
    })
    await restarted.remove(id)
    expect(await new LibraryStore(root, 'narration').list()).toEqual([])
    await expect(fs.stat(join(folder, second.fileName))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('keeps the old clip after validation or index publication fails and leaves no new audio or temp files', async () => {
    const first = await narration.save(id, Buffer.from('first'), '.wav')
    const bad = new PhotoNarration(photos, audio, async () => {
      throw new Error('bad audio')
    })
    await expect(bad.save(id, Buffer.from('bad'), '.wav')).rejects.toThrow('bad audio')
    const broken = new LibraryStore(root, 'narration', {
      ...fs,
      writeFile: async (path, data) => {
        if (path.endsWith('.index.tmp')) throw new Error('disk full')
        await fs.writeFile(path, data)
      }
    })
    await expect(
      new PhotoNarration(photos, broken, validate).save(id, Buffer.from('new'), '.webm')
    ).rejects.toThrow('disk full')
    expect(await fs.readdir(libraryPaths(root, 'narration').folder)).toEqual(
      [first.fileName, 'index.json'].sort()
    )
    expect(await audio.list()).toEqual([first])
  })
  it('rejects missing photos and unsupported or oversized payloads before saving', async () => {
    await expect(narration.save('missing', Buffer.from('voice'), '.wav')).rejects.toThrow()
    await expect(narration.save(id, Buffer.from('voice'), '.jpg')).rejects.toThrow()
    await expect(narration.save(id, Buffer.alloc(20 * 1024 * 1024 + 1), '.wav')).rejects.toThrow()
    expect(await audio.list()).toEqual([])
  })
})
