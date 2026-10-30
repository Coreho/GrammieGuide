import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlocked: vi.fn(),
  activity: vi.fn(),
  adminSend: vi.fn(),
  homeSend: vi.fn(),
  admin: { webContents: { mainFrame: {}, send: (...args: unknown[]) => mocks.adminSend(...args) } },
  home: { webContents: { mainFrame: {}, send: (...args: unknown[]) => mocks.homeSend(...args) } }
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle }, app: { getPath: () => '' } }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlocked }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.activity }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => mocks.admin,
  getLauncherWindow: () => mocks.home
}))
import { registerKnittingIpc } from '../../src/main/ipc/knittingIpc'

const home = { sender: mocks.home.webContents, senderFrame: mocks.home.webContents.mainFrame }
const admin = { sender: mocks.admin.webContents, senderFrame: mocks.admin.webContents.mainFrame }
const photoId = '22222222-2222-4222-8222-222222222222'

let folder: string
let clock: number
type Handler = (event: unknown, request?: unknown) => Promise<unknown>
const handler = (channel: string): Handler =>
  mocks.handle.mock.calls.find(([name]) => name === channel)![1] as Handler

beforeEach(() => {
  vi.clearAllMocks()
  folder = mkdtempSync(join(tmpdir(), 'grammieguide-knitting-ipc-'))
  clock = 100_000
  registerKnittingIpc(
    async (id) =>
      id === photoId
        ? {
            url: 'grammie-media://photos/a.jpg',
            thumbnailUrl: 'grammie-media://photos/a.thumb.jpg'
          }
        : undefined,
    () => folder,
    () => clock
  )
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('knitting IPC', () => {
  it('shows Home a calm empty state before anything is set up', async () => {
    expect(await handler('knitting:home')(home)).toEqual({ project: null })
    expect(await handler('knitting:changeRows')(home, { direction: 'add' })).toEqual({
      project: null
    })
    expect(mocks.activity).not.toHaveBeenCalled()
  })

  it('lets the caregiver set up her project, and Home count rows with a double-tap guard', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Scarf', forWhom: 'Tom', photoId })
    expect(await handler('knitting:home')(home)).toEqual({
      project: {
        name: 'Scarf',
        forWhom: 'Tom',
        rows: 0,
        photoUrl: 'grammie-media://photos/a.jpg',
        thumbnailUrl: 'grammie-media://photos/a.thumb.jpg'
      }
    })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    clock += 200
    const doubled = (await handler('knitting:changeRows')(home, { direction: 'add' })) as {
      project: { rows: number }
    }
    expect(doubled.project.rows).toBe(1)
    clock += 5_000
    await handler('knitting:changeRows')(home, { direction: 'add' })
    expect(await handler('knitting:get')(admin)).toEqual({
      project: { name: 'Scarf', forWhom: 'Tom', photoId, rows: 2 }
    })
    expect(mocks.homeSend).toHaveBeenCalledWith('knitting:changed', {})
    expect(mocks.adminSend).toHaveBeenCalledWith('knitting:changed', {})
  })

  it('keeps her count when the caregiver edits the details, and starts over only on request', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Scarf', forWhom: 'Tom' })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    await handler('knitting:saveProject')(admin, { name: 'Long scarf', forWhom: 'Tom' })
    expect(await handler('knitting:get')(admin)).toMatchObject({
      project: { name: 'Long scarf', rows: 1 }
    })
    await handler('knitting:saveProject')(admin, { name: 'Hat', forWhom: '', startNew: true })
    expect(await handler('knitting:get')(admin)).toMatchObject({
      project: { name: 'Hat', rows: 0 }
    })
  })

  it('resets and removes only from the caregiver side', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Scarf' })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    expect(await handler('knitting:resetRows')(admin)).toMatchObject({ project: { rows: 0 } })
    expect(await handler('knitting:removeProject')(admin)).toEqual({ project: null })
    expect(await handler('knitting:home')(home)).toEqual({ project: null })
  })

  it.each(['knitting:get', 'knitting:saveProject', 'knitting:resetRows', 'knitting:removeProject'])(
    'refuses Home and a locked admin for %s',
    async (channel) => {
      await expect(handler(channel)(home, { name: 'Scarf' })).rejects.toThrow(
        'Caregiver window required'
      )
      await expect(
        handler(channel)({ sender: admin.sender, senderFrame: {} }, { name: 'Scarf' })
      ).rejects.toThrow('Caregiver window required')
      mocks.unlocked.mockImplementationOnce(() => {
        throw new Error('admin unlock required')
      })
      await expect(handler(channel)(admin, { name: 'Scarf' })).rejects.toThrow(
        'admin unlock required'
      )
    }
  )

  it.each(['knitting:home', 'knitting:changeRows'])(
    'refuses anything but Home for %s',
    async (channel) => {
      await expect(handler(channel)(admin, { direction: 'add' })).rejects.toThrow(
        'Home window required'
      )
    }
  )

  it('rejects an unknown row change', async () => {
    await expect(handler('knitting:changeRows')(home, { direction: 'reset' })).rejects.toThrow()
  })

  it('never logs what she is making or who it is for', async () => {
    await handler('knitting:saveProject')(admin, { name: 'Secret scarf', forWhom: 'Granddaughter' })
    await handler('knitting:changeRows')(home, { direction: 'add' })
    clock += 5_000
    await handler('knitting:changeRows')(home, { direction: 'remove' })
    await handler('knitting:resetRows')(admin)
    const logged = JSON.stringify(mocks.activity.mock.calls)
    expect(logged).not.toContain('Secret')
    expect(logged).not.toContain('Granddaughter')
    expect(mocks.activity.mock.calls.map(([type]) => type)).toEqual([
      'knitting-project-saved',
      'knitting-row-added',
      'knitting-row-removed',
      'knitting-rows-reset'
    ])
  })
})
