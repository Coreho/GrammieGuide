import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { isInstalledExe } from '../../src/main/services/reliability/installLocation'

const electron = vi.hoisted(() => ({ isPackaged: true }))
const reliability = vi.hoisted(() => [] as { op: string; ok: boolean }[])
const registered = vi.hoisted(() => [] as string[])

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return electron.isPackaged
    },
    getPath: () => 'C:\\data',
    getAppPath: () => 'C:\\app'
  }
}))
vi.mock('../../src/main/config/store', () => ({
  getConfig: () => ({ display: { volumeCeiling: 50 }, reliability: {} }),
  setConfig: vi.fn()
}))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({
  logReliabilityEvent: (event: { op: string; ok: boolean }) => reliability.push(event)
}))
vi.mock('../../src/main/services/reliability/volumeEnforcer', () => ({
  enforceVolumeCeiling: async () => {}
}))
vi.mock('../../src/main/services/reliability/wifiHealer', () => ({
  resolveWifiAdapterName: vi.fn(),
  restartWifiAdapter: vi.fn()
}))
vi.mock('../../src/main/services/reliability/wifiWatch', () => ({
  CHECK_INTERVAL_MS: 1000,
  INITIAL_WIFI_STATE: {},
  decideWifi: vi.fn(),
  isOnline: vi.fn()
}))
vi.mock('../../src/main/services/reliability/watchdog', () => ({
  clearQuitFlag: vi.fn(),
  registerAutostartTask: async (exe: string) => {
    registered.push(exe)
    return true
  },
  registerWatchdogTask: async (_script: string, _heartbeat: string, exe: string) => {
    registered.push(exe)
    return true
  }
}))

const PROGRAM_FILES = 'C:\\Program Files'
const INSTALLED = 'C:\\Program Files\\GrammieGuide\\GrammieGuide.exe'
const STRAY = 'C:\\Temp\\pkg\\win-unpacked\\GrammieGuide.exe'

describe('isInstalledExe', () => {
  it('accepts the exe the installer places', () => {
    expect(isInstalledExe(INSTALLED, PROGRAM_FILES)).toBe(true)
  })

  it('ignores case, as Windows does', () => {
    expect(isInstalledExe('c:\\program files\\grammieguide\\GRAMMIEGUIDE.EXE', PROGRAM_FILES)).toBe(
      true
    )
  })

  it('follows Program Files if Windows keeps it on another drive', () => {
    expect(isInstalledExe('D:\\Apps\\GrammieGuide\\GrammieGuide.exe', 'D:\\Apps')).toBe(true)
    expect(isInstalledExe(INSTALLED, 'D:\\Apps')).toBe(false)
  })

  it.each([
    ['the build folder', 'C:\\Users\\jeale\\GrammieGuide\\dist\\win-unpacked\\GrammieGuide.exe'],
    ['a temp folder', STRAY],
    ['a look-alike folder', 'C:\\Program Files\\GrammieGuide Old\\GrammieGuide.exe'],
    ['a folder inside the install', 'C:\\Program Files\\GrammieGuide\\old\\GrammieGuide.exe'],
    ['the 32-bit folder', 'C:\\Program Files (x86)\\GrammieGuide\\GrammieGuide.exe'],
    ['another exe in the install', 'C:\\Program Files\\GrammieGuide\\Uninstall GrammieGuide.exe'],
    ['a path that climbs out', 'C:\\Program Files\\GrammieGuide\\..\\Other\\GrammieGuide.exe']
  ])('refuses %s', (_name, exe) => {
    expect(isInstalledExe(exe, PROGRAM_FILES)).toBe(false)
  })

  it('refuses when Windows does not say where Program Files is', () => {
    expect(isInstalledExe(INSTALLED, undefined)).toBe(false)
    expect(isInstalledExe(INSTALLED, '')).toBe(false)
  })
})

describe('registerSystemTasks', () => {
  const realExecPath = process.execPath
  const runningFrom = (exe: string): void => {
    Object.defineProperty(process, 'execPath', { value: exe, configurable: true, writable: true })
  }
  // Electron sets this in a packaged app; plain Node doesn't have it.
  const processWithResources = process as NodeJS.Process & { resourcesPath?: string }

  beforeEach(() => {
    electron.isPackaged = true
    reliability.length = 0
    registered.length = 0
    vi.stubEnv('ProgramFiles', PROGRAM_FILES)
    vi.stubEnv('GRAMMIEGUIDE_E2E', '')
    runningFrom(INSTALLED)
    processWithResources.resourcesPath = 'C:\\Program Files\\GrammieGuide\\resources'
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    runningFrom(realExecPath)
    delete processWithResources.resourcesPath
  })

  const load = (): Promise<typeof import('../../src/main/services/reliability/kioskServices')> =>
    import('../../src/main/services/reliability/kioskServices')

  it('registers both tasks at the installed exe', async () => {
    const { registerSystemTasks } = await load()
    await expect(registerSystemTasks()).resolves.toBe(true)
    expect(registered).toEqual([INSTALLED, INSTALLED])
    expect(reliability).toEqual([])
  })

  it('leaves the tasks alone for a packaged copy elsewhere, and says so', async () => {
    runningFrom(STRAY)
    const { registerSystemTasks } = await load()
    await expect(registerSystemTasks()).resolves.toBe(false)
    expect(registered).toEqual([])
    expect(reliability).toEqual([
      expect.objectContaining({ op: 'system-tasks-skipped', ok: false })
    ])
  })

  it("admin's forced re-register can't move them either", async () => {
    runningFrom(STRAY)
    const { registerSystemTasks } = await load()
    await expect(registerSystemTasks({ force: true })).resolves.toBe(false)
    expect(registered).toEqual([])
  })

  it('startup goes through the same check', async () => {
    runningFrom(STRAY)
    const { startKioskServices, stopKioskServices } = await load()
    vi.useFakeTimers()
    try {
      startKioskServices()
      await vi.advanceTimersByTimeAsync(0)
    } finally {
      stopKioskServices()
      vi.useRealTimers()
    }
    expect(registered).toEqual([])
    expect(reliability).toEqual([
      expect.objectContaining({ op: 'system-tasks-skipped', ok: false })
    ])
  })

  it('stays quiet in dev and under e2e, where skipping is normal', async () => {
    const { registerSystemTasks } = await load()
    electron.isPackaged = false
    await expect(registerSystemTasks()).resolves.toBe(false)
    electron.isPackaged = true
    vi.stubEnv('GRAMMIEGUIDE_E2E', '1')
    await expect(registerSystemTasks()).resolves.toBe(false)
    expect(registered).toEqual([])
    expect(reliability).toEqual([])
  })
})
