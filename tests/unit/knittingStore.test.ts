import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnittingStore } from '../../src/main/services/knitting/knittingStore'
import type { KnittingFile } from '../../src/shared/knitting/knitting'

const scarf: KnittingFile = {
  version: 1,
  project: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Scarf',
    forWhom: 'Tom',
    rows: 3
  }
}

let folder: string
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-'))
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('knitting store', () => {
  it('starts with no project and writes nothing until something changes', async () => {
    const store = new KnittingStore(folder)
    expect(await store.read()).toEqual({ version: 1, project: null })
    await store.update((file) => file)
    expect(readdirSync(folder)).toEqual([])
  })

  it('keeps her count for the next start', async () => {
    await new KnittingStore(folder).update(() => scarf)
    expect(await new KnittingStore(folder).read()).toEqual(scarf)
    expect(readdirSync(folder)).toEqual(['project.json'])
  })

  it('applies quick changes one after another so no row is lost', async () => {
    const store = new KnittingStore(folder)
    await store.update(() => scarf)
    const addOne = (file: KnittingFile): KnittingFile => ({
      ...file,
      project: file.project && { ...file.project, rows: file.project.rows + 1 }
    })
    await Promise.all([store.update(addOne), store.update(addOne), store.update(addOne)])
    expect((await new KnittingStore(folder).read()).project?.rows).toBe(6)
  })

  it('sets a damaged file aside and starts empty instead of failing Home', async () => {
    writeFileSync(join(folder, 'project.json'), '{"version":1,"project":{"rows":')
    const onReset = vi.fn()
    const store = new KnittingStore(folder, onReset)
    expect(await store.read()).toEqual({ version: 1, project: null })
    const [backup] = onReset.mock.calls[0]!
    expect(backup).toMatch(/^project\.corrupt-\d+\.json$/)
    expect(readFileSync(join(folder, backup), 'utf8')).toBe('{"version":1,"project":{"rows":')
  })

  it('refuses a change that would save an invalid project', async () => {
    const store = new KnittingStore(folder)
    await store.update(() => scarf)
    await expect(
      store.update((file) => ({ ...file, project: { ...file.project!, rows: -1 } }))
    ).rejects.toThrow()
    expect((await new KnittingStore(folder).read()).project?.rows).toBe(3)
    // The failed change doesn't block the next one.
    await store.update((file) => ({ ...file, project: { ...file.project!, rows: 4 } }))
    expect((await new KnittingStore(folder).read()).project?.rows).toBe(4)
  })
})
