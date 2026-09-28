import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  openPath: vi.fn(),
  getConfig: vi.fn(),
  getLauncher: vi.fn(),
  log: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  shell: { openPath: mocks.openPath }
}))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.getConfig }))
vi.mock('../../src/main/windows/windowManager', () => ({ getLauncherWindow: mocks.getLauncher }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.log }))
import { registerTileIpc } from '../../src/main/ipc/tileIpc'

describe('configured app tiles', () => {
  const launcher = {
    webContents: {},
    isAlwaysOnTop: () => true,
    setAlwaysOnTop: vi.fn(),
    isDestroyed: () => false,
    once: vi.fn(),
    removeListener: vi.fn()
  }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLauncher.mockReturnValue(launcher)
    mocks.getConfig.mockReturnValue({
      tiles: [{ id: 'app', type: 'app', appPath: 'C:\\Apps\\Family.exe' }]
    })
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
    expect(launcher.setAlwaysOnTop).toHaveBeenCalledWith(false)
    launcher.once.mock.calls[0]![1]()
    expect(launcher.setAlwaysOnTop).toHaveBeenLastCalledWith(true)
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
      expect(launcher.setAlwaysOnTop).toHaveBeenLastCalledWith(true)
    }
  )
})
