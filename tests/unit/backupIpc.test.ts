import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, toPublicConfig, type Config } from '../../src/shared/configSchema'
import { buildConfigBackup } from '../../src/main/services/config/backup'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  unlock: vi.fn(),
  save: vi.fn(),
  open: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  send: vi.fn(),
  log: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  dialog: { showSaveDialog: mocks.save, showOpenDialog: mocks.open }
}))
vi.mock('node:fs/promises', () => ({ readFile: mocks.read, writeFile: mocks.write }))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.get, setConfig: mocks.set }))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: () => ({ webContents: { send: mocks.send } })
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.log }))
import { registerBackupIpc } from '../../src/main/ipc/backupIpc'

describe('admin backup IPC', () => {
  let device: Config
  const invoke = async (channel: string): Promise<unknown> =>
    mocks.handle.mock.calls.find(([name]) => name === channel)![1]({})
  beforeEach(() => {
    vi.resetAllMocks()
    device = defaultConfig()
    device.buddy.anthropicApiKey = 'device-key'
    device.reliability = { adminPinHash: 'device-hash', adminPinSalt: 'device-salt' }
    mocks.get.mockImplementation(() => device)
    mocks.set.mockImplementation((config: Config) => {
      device = config
      return device
    })
    mocks.save.mockResolvedValue({ canceled: false, filePath: 'chosen/backup.json' })
    mocks.open.mockResolvedValue({ canceled: false, filePaths: ['chosen/backup.json'] })
    mocks.read.mockResolvedValue(buildConfigBackup(defaultConfig()))
    registerBackupIpc()
  })

  it.each(['backup:save', 'backup:restore'])(
    'requires admin unlock before any %s work',
    async (channel) => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      await expect(invoke(channel)).rejects.toThrow('locked')
      for (const operation of [
        mocks.save,
        mocks.open,
        mocks.read,
        mocks.write,
        mocks.get,
        mocks.set
      ])
        expect(operation).not.toHaveBeenCalled()
    }
  )

  it('saves secret-free JSON only to the native picker selection', async () => {
    expect(await invoke('backup:save')).toEqual({ ok: true })
    const [path, text] = mocks.write.mock.calls[0]!
    expect(path).toBe('chosen/backup.json')
    expect(text).not.toContain('device-key')
    expect(text).not.toContain('device-hash')
    expect(text).not.toContain('device-salt')
    expect(text).toMatch(/photo and music files are not included/i)
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: 'GrammieGuide backup', extensions: ['json'] }] })
    )
  })

  it('restores and publishes public config, keeping secrets from the latest device config', async () => {
    const source = defaultConfig()
    source.display.fontStep = 3
    mocks.read.mockImplementation(async () => {
      device.buddy.anthropicApiKey = 'latest-key'
      return buildConfigBackup(source)
    })
    expect(await invoke('backup:restore')).toEqual({ ok: true, config: toPublicConfig(source) })
    expect(device.display.fontStep).toBe(3)
    expect(device.buddy.anthropicApiKey).toBe('latest-key')
    expect(device.reliability).toEqual({ adminPinHash: 'device-hash', adminPinSalt: 'device-salt' })
    expect(mocks.send).toHaveBeenCalledWith('config:changed', toPublicConfig(source))
  })

  it.each([
    'broken JSON',
    '{}',
    JSON.stringify({ format: 'GrammieGuide settings backup', backupVersion: 1, config: {} })
  ])('rejects %s without saving or publishing config', async (text) => {
    mocks.read.mockResolvedValue(text)
    const before = structuredClone(device)
    expect(await invoke('backup:restore')).toEqual({
      ok: false,
      message: expect.stringMatching(/not a valid GrammieGuide settings backup/i)
    })
    expect(device).toEqual(before)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each(['backup:save', 'backup:restore'])(
    'cancels %s without file IO or config writes',
    async (channel) => {
      mocks.save.mockResolvedValue({ canceled: true })
      mocks.open.mockResolvedValue({ canceled: true, filePaths: [] })
      expect(await invoke(channel)).toEqual({ ok: false, canceled: true })
      for (const operation of [mocks.read, mocks.write, mocks.set])
        expect(operation).not.toHaveBeenCalled()
    }
  )

  it.each(['backup:save', 'backup:restore'])(
    'rechecks admin lock after the %s picker',
    async (channel) => {
      const selection = async (): Promise<{
        canceled: boolean
        filePath: string
        filePaths: string[]
      }> => {
        mocks.unlock.mockImplementation(() => {
          throw new Error('locked')
        })
        return { canceled: false, filePath: 'chosen', filePaths: ['chosen'] }
      }
      mocks.save.mockImplementation(selection)
      mocks.open.mockImplementation(selection)
      await expect(invoke(channel)).rejects.toThrow('locked')
      for (const operation of [mocks.read, mocks.write, mocks.set])
        expect(operation).not.toHaveBeenCalled()
    }
  )

  it('rechecks the lock after reading before applying a restore', async () => {
    mocks.read.mockImplementation(async () => {
      mocks.unlock.mockImplementation(() => {
        throw new Error('locked')
      })
      return buildConfigBackup(defaultConfig())
    })
    await expect(invoke('backup:restore')).rejects.toThrow('locked')
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it.each(['backup:save', 'backup:restore'])(
    'returns path-free plain file errors for %s',
    async (channel) => {
      const error = new Error('EPERM: private/backup.json')
      mocks.write.mockRejectedValue(error)
      mocks.read.mockRejectedValue(error)
      const result = await invoke(channel)
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/could not/i) })
      expect(JSON.stringify(result)).not.toMatch(/EPERM|private/)
      expect(mocks.set).not.toHaveBeenCalled()
    }
  )
})
