import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  openPath: vi.fn(),
  getConfig: vi.fn(),
  getLauncher: vi.fn(),
  stepHomeDown: vi.fn(),
  log: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  shell: { openPath: mocks.openPath }
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.getConfig }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: mocks.getLauncher,
  stepHomeDown: mocks.stepHomeDown
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.log }))
import { registerTileIpc } from '../../src/main/ipc/tileIpc'

describe('configured app tiles', () => {
  const launcher = {
    webContents: {},
    isDestroyed: () => false,
    once: vi.fn(),
    removeListener: vi.fn()
  }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLauncher.mockReturnValue(launcher)
    const config = defaultConfig()
    config.tiles = [
      {
        id: 'app',
        label: 'Saved app',
        type: 'app',
        appPath: 'C:\\Apps\\Family.exe',
        size: 'normal',
        slot: 0,
        colorIndex: 0
      }
    ]
    mocks.getConfig.mockReturnValue(config)
    mocks.openPath.mockResolvedValue('')
    registerTileIpc()
  })
  const invoke = (sender: unknown, req: unknown): Promise<{ ok: boolean }> =>
    mocks.handle.mock.calls[0]![1]({ sender }, req)

  it('opens only the stored path, temporarily lowering the kiosk until focus returns', async () => {
    expect(await invoke(launcher.webContents, { id: 'app', appPath: 'C:\\untrusted.exe' })).toEqual(
      { ok: true }
    )
    expect(mocks.openPath).toHaveBeenCalledWith('C:\\Apps\\Family.exe')
    expect(mocks.stepHomeDown).toHaveBeenCalledWith('app', true)
    launcher.once.mock.calls[0]![1]()
    expect(mocks.stepHomeDown).toHaveBeenLastCalledWith('app', false)
  })

  it('rejects other renderers and unknown tile IDs without opening anything', async () => {
    expect(await invoke({}, { id: 'app' })).toEqual({ ok: false })
    expect(await invoke(launcher.webContents, { id: 'missing' })).toEqual({ ok: false })
    expect(await invoke(launcher.webContents, null)).toEqual({ ok: false })
    expect(mocks.openPath).not.toHaveBeenCalled()
  })

  it.each(['missing file', new Error('unavailable')])(
    'restores kiosk stacking after launch failure',
    async (failure) => {
      if (failure instanceof Error) mocks.openPath.mockRejectedValue(failure)
      else mocks.openPath.mockResolvedValue(failure)
      expect(await invoke(launcher.webContents, { id: 'app' })).toEqual({ ok: false })
      expect(mocks.stepHomeDown).toHaveBeenLastCalledWith('app', false)
    }
  )
  it('rechecks visibility at the actual launch, including overflow and layout changes', async () => {
    const config = mocks.getConfig()
    config.tiles[0].slot = null
    expect(await invoke(launcher.webContents, { id: 'app' })).toEqual({ ok: false })
    config.display.homeLayout = 'simple4'
    config.tiles[0].slot = 7
    expect(await invoke(launcher.webContents, { id: 'app' })).toEqual({ ok: false })
    expect(mocks.openPath).not.toHaveBeenCalled()
  })

  it('launches caregiver-configured installed games only when a Games tile is on Home', async () => {
    const invokeInstalled = (sender: unknown, req: unknown): Promise<{ ok: boolean }> =>
      mocks.handle.mock.calls[1]![1]({ sender }, req)
    const invokeReport = (sender: unknown, req: unknown): boolean =>
      mocks.handle.mock.calls[2]![1]({ sender }, req)

    const config = mocks.getConfig()
    config.games.installedGames = [
      {
        id: 'solitaire',
        label: 'Solitaire',
        appPath: 'C:\\Games\\Solitaire.exe',
        colorIndex: 1
      }
    ]
    // No Games tile on Home yet -> rejected
    expect(await invokeInstalled(launcher.webContents, { id: 'solitaire' })).toEqual({ ok: false })
    expect(mocks.openPath).not.toHaveBeenCalled()

    // Add a visible Games tile on Home
    config.tiles.push({
      id: 'games-tile',
      label: 'Games',
      type: 'builtin',
      builtinKey: 'games',
      size: 'normal',
      slot: 1,
      colorIndex: 2
    })
    expect(
      await invokeInstalled(launcher.webContents, {
        id: 'solitaire',
        appPath: 'C:\\evil.exe'
      })
    ).toEqual({ ok: true })
    expect(mocks.openPath).toHaveBeenCalledWith('C:\\Games\\Solitaire.exe')
    expect(mocks.log).toHaveBeenCalledWith('games-app-opened', 'solitaire')

    // Built-in game activity report logs only the game key
    expect(invokeReport(launcher.webContents, { game: 'matching' })).toBe(true)
    expect(mocks.log).toHaveBeenCalledWith('games-builtin-opened', 'matching')
    expect(invokeReport({}, { game: 'matching' })).toBe(false)
    expect(invokeReport(launcher.webContents, { game: 'unknown' })).toBe(false)
  })
})
