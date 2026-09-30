import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, type Config } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  unlock: vi.fn(),
  send: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/config/store', () => ({
  getConfig: mocks.getConfig,
  setConfig: mocks.setConfig
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: () => ({ webContents: { send: mocks.send } })
}))
import { registerConfigIpc } from '../../src/main/ipc/configIpc'

describe('caregiver tile colors', () => {
  let config: Config
  const invoke = (patch: unknown): Config =>
    mocks.handle.mock.calls.find(([channel]) => channel === 'config:set')![1]({}, patch)

  beforeEach(() => {
    vi.resetAllMocks()
    config = defaultConfig()
    config.tiles = [
      { id: 'a', label: 'Family', type: 'web', size: 'normal', colorIndex: 3 },
      { id: 'b', label: 'Weather', type: 'builtin', size: 'wide', colorIndex: 0 }
    ]
    mocks.getConfig.mockImplementation(() => config)
    mocks.setConfig.mockImplementation((patch: Partial<Config>) => {
      config = { ...config, ...patch }
      return config
    })
    registerConfigIpc()
  })

  it('requires an unlocked admin before changing tiles', () => {
    mocks.unlock.mockImplementation(() => {
      throw new Error('locked')
    })
    expect(() => invoke({ tiles: [] })).toThrow('locked')
    expect(mocks.setConfig).not.toHaveBeenCalled()
  })

  it('keeps colors through reorder, edit, addition and removal and publishes them to Home', () => {
    expect(
      invoke({ tiles: [...config.tiles].reverse() }).tiles.map((tile) => tile.colorIndex)
    ).toEqual([0, 3])
    const added = { id: 'c', label: 'News', type: 'web', size: 'normal' }
    const result = invoke({ tiles: [...config.tiles, added] })
    expect(result.tiles.map((tile) => tile.colorIndex)).toEqual([0, 3, 1])
    const edited = { ...config.tiles[0]!, label: 'Forecast', colorIndex: 2 }
    expect(
      invoke({ tiles: [edited, ...config.tiles.slice(1)] }).tiles.map((tile) => tile.colorIndex)
    ).toEqual([2, 3, 1])
    expect(invoke({ tiles: config.tiles.slice(1) }).tiles.map((tile) => tile.colorIndex)).toEqual([
      3, 1
    ])
    expect(mocks.send).toHaveBeenLastCalledWith(
      'config:changed',
      expect.objectContaining({ tiles: config.tiles })
    )
  })

  it('preserves omitted existing colors and reserves explicit choices before allocating new ones', () => {
    const result = invoke({
      tiles: [
        { id: 'c', label: 'News', type: 'web', size: 'normal' },
        { ...config.tiles[0]!, colorIndex: undefined },
        { ...config.tiles[1]!, colorIndex: 0 },
        { id: 'd', label: 'Music', type: 'web', size: 'normal', colorIndex: 1 }
      ]
    })
    expect(result.tiles.map((tile) => tile.colorIndex)).toEqual([2, 3, 0, 1])
  })

  it.each([-1, 4, 0.5, 'blue'])(
    'rejects invalid color %s without saving or publishing',
    (colorIndex) => {
      expect(() => invoke({ tiles: [{ ...config.tiles[0], colorIndex }] })).toThrow()
      expect(mocks.setConfig).not.toHaveBeenCalled()
      expect(mocks.send).not.toHaveBeenCalled()
    }
  )
})
