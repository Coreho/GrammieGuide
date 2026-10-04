import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, type Config } from '../../src/shared/configSchema'
import { applyConfigPatch } from '../../src/main/config/applyConfigPatch'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  unlock: vi.fn(),
  send: vi.fn(),
  logActivity: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../src/main/config/store', () => ({
  getConfig: mocks.getConfig,
  setConfig: mocks.setConfig
}))
vi.mock('../../src/main/ipc/requireAdminUnlocked', () => ({ requireAdminUnlocked: mocks.unlock }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({
  logActivity: mocks.logActivity
}))
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

/**
 * A rejected save must be completely invisible: no state change, nothing pushed to
 * Home, and nothing in the activity log. `setConfig` is mocked to delegate to the
 * real applyConfigPatch so the validation under test is the production one rather
 * than a stand-in that always succeeds (TASK-39).
 */
describe('config:set rejects an invalid patch', () => {
  let config: Config
  const invoke = (patch: unknown): unknown =>
    mocks.handle.mock.calls.find(([channel]) => channel === 'config:set')![1]({}, patch)

  beforeEach(() => {
    vi.resetAllMocks()
    config = defaultConfig()
    mocks.getConfig.mockImplementation(() => config)
    mocks.setConfig.mockImplementation((patch: Partial<Config>) => {
      const result = applyConfigPatch(config, patch)
      if (!result.ok) throw result.error
      config = result.config
      return config
    })
    registerConfigIpc()
  })

  it.each([
    ['an unknown theme', (d: Config) => ({ display: { ...d.display, theme: 'nope' } })],
    [
      'an out-of-range inactivity timeout',
      (d: Config) => ({ confusion: { ...d.confusion, inactivityTimeoutMinutes: 0 } })
    ],
    ['weather with no locations', () => ({ weather: { units: 'metric' } })],
    ['an unknown schemaVersion', () => ({ schemaVersion: 1 })]
  ])('rejects %s and leaves no trace', (_label, build) => {
    const before = structuredClone(config)
    const patch = typeof build === 'function' ? (build as (d: Config) => unknown)(config) : build

    expect(() => invoke(patch)).toThrow(/could not be saved/)

    expect(config).toEqual(before)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalledWith('config-updated', expect.anything())
  })

  it('still saves and publishes a valid non-tile patch', () => {
    const result = invoke({ display: { ...config.display, volumeCeiling: 62 } }) as Config
    expect(result.display.volumeCeiling).toBe(62)
    expect(mocks.send).toHaveBeenCalledWith('config:changed', expect.anything())
    expect(mocks.logActivity).toHaveBeenCalledWith('config-updated', 'display')
  })
})
