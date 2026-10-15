import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { validateNarration } from '../../src/main/services/photos/validateNarration'
describe('actual narration file validation', () => {
  it.each(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'webm'])(
    'accepts generated %s audio bytes',
    async (extension) => {
      await expect(
        validateNarration(await readFile(`tests/fixtures/music/tone.${extension}`), `.${extension}`)
      ).resolves.toBeUndefined()
    }
  )
  it('rejects corrupt bytes and photos, even with an audio extension', async () => {
    await expect(validateNarration(Buffer.from('broken'), '.webm')).rejects.toThrow()
    await expect(
      validateNarration(await readFile('tests/fixtures/music/cover.png'), '.mp3')
    ).rejects.toThrow()
  })
})
