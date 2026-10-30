import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiskRequestStore } from '../../src/main/services/contacts/requestStore'
import { ContactRequests } from '../../src/main/services/contacts/contactRequests'

const folders: string[] = []
async function fixture(): Promise<{ folder: string; store: DiskRequestStore }> {
  const folder = await mkdtemp(join(tmpdir(), 'grammie-contacts-'))
  folders.push(folder)
  return { folder, store: new DiskRequestStore(folder) }
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true })))
})

describe('contact request disk journal', () => {
  it('starts empty only if missing and atomically preserves an accepted request through a new instance', async () => {
    const { folder, store } = await fixture()
    expect(await store.load()).toEqual({ version: 1, requests: [] })
    const service = new ContactRequests(store, {
      submit: async () => ({ sid: 'SMsaved', sender: '+15550000000' }),
      delivery: async () => ({ status: 'pending' }),
      replies: async () => []
    })
    const first = await service.request({
      purpose: 'real',
      contacts: [{ id: 'primary', phone: '+15551111111' }],
      expiresAfterMs: 600_000,
      fallbackAfterMs: 60_000
    })
    const saved = await new DiskRequestStore(folder).load()
    expect(saved.requests[0]?.id).toBe(first.id)
    expect(saved.requests[0]?.attempts[0]?.sid).toBe('SMsaved')
    expect(await readdir(folder)).toEqual(['contact-requests.json'])
  })

  it.each(['', '{', '{}', '{"version":2,"requests":[]}', '{"version":1,"requests":[{}]}'])(
    'fails closed on corrupt history (%j), leaving its bytes untouched',
    async (raw) => {
      const { folder, store } = await fixture()
      const path = join(folder, 'contact-requests.json')
      await writeFile(path, raw)
      await expect(store.load()).rejects.toThrow('Request history unavailable')
      expect(await readFile(path, 'utf8')).toBe(raw)
    }
  )

  it('rejects an oversized file without exposing its contents', async () => {
    const { folder, store } = await fixture()
    await writeFile(join(folder, 'contact-requests.json'), 'private'.repeat(300_000))
    await expect(store.load()).rejects.toThrow('Request history unavailable')
  })
})
