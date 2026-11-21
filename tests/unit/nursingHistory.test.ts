import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NursingStore } from '../../src/main/services/nursing/nursingStore'
import {
  EMPTY_NURSING_FILE,
  nursingForHome,
  pageCount,
  type NursingFile
} from '../../src/shared/nursing/nursingHistory'

function history(pages: string[]): NursingFile {
  return {
    version: 1,
    chapters: [
      {
        id: randomUUID(),
        title: 'Nursing school',
        years: '1960s',
        story: 'She trained as a nurse.',
        papers: [{ id: randomUUID(), title: 'Her diploma', note: '', pages }]
      }
    ]
  }
}

describe('nursing history store', () => {
  let folder: string
  beforeEach(async () => {
    folder = await fs.mkdtemp(join(tmpdir(), 'grammie-nursing-'))
  })
  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true })
  })

  it('starts empty when there is no history yet', async () => {
    expect(await new NursingStore(folder).read()).toEqual(EMPTY_NURSING_FILE)
  })

  it('saves a whole history atomically and reads it back in a new store', async () => {
    const file = history([randomUUID(), randomUUID()])
    await new NursingStore(folder).replace(file)
    expect(await new NursingStore(folder).read()).toEqual(file)
    expect((await fs.readdir(folder)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('refuses an invalid history and keeps the saved one', async () => {
    const store = new NursingStore(folder)
    const file = history([randomUUID()])
    await store.replace(file)
    await expect(store.replace(history([]))).rejects.toThrow()
    await expect(
      store.replace({ version: 1, chapters: [{ ...file.chapters[0]!, title: '  ' }] })
    ).rejects.toThrow()
    expect(await new NursingStore(folder).read()).toEqual(file)
  })

  it('sets a damaged file aside, reports it, and starts empty', async () => {
    await fs.writeFile(join(folder, 'history.json'), '{"version":1,"chapters":[{"oops"')
    const resets: string[] = []
    expect(await new NursingStore(folder, (name) => resets.push(name)).read()).toEqual(
      EMPTY_NURSING_FILE
    )
    expect(resets).toHaveLength(1)
    expect(resets[0]).toMatch(/^history\.corrupt-\d+\.json$/)
    expect(await fs.readdir(folder)).toEqual([resets[0]])
  })
})

describe('nursing history for Home', () => {
  it('gives Home media URLs for pages that exist and null for a page whose picture is gone', () => {
    const [present, gone, unsafe] = [randomUUID(), randomUUID(), randomUUID()]
    const home = nursingForHome(history([present, gone, unsafe]), [
      { id: present, fileName: `${present}.jpg`, metadata: {} },
      { id: unsafe, fileName: '..\\secret.jpg', metadata: {} }
    ])
    expect(home.chapters[0]!.papers[0]!.pages).toEqual([
      `grammie-media://nursing/${present}.jpg`,
      null,
      null
    ])
    expect(home.chapters[0]).toMatchObject({ title: 'Nursing school', years: '1960s' })
  })

  it('says page counts the way she reads them', () => {
    expect(pageCount(1)).toBe('1 page')
    expect(pageCount(12)).toBe('12 pages')
  })
})
