import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * An unreadable config file used to crash-loop the kiosk (TASK-39).
 *
 * store.ts built its electron-store at module load, electron-store reads the file
 * in its constructor and rethrows a JSON SyntaxError, and store.ts is imported at
 * the top of index.ts - before app.whenReady. The documented backup-and-defaults
 * fallback lived *inside* loadConfig, so a truncated or hand-edited file killed the
 * main process before it could run, and the watchdog relaunched into the same
 * crash.
 *
 * electron-store is replaced by a fake rather than inlined for the whole suite: it
 * is ESM and reads its own paths from the real `electron` at import time, so
 * vi.mock('electron') cannot reach it. The fake reproduces exactly the three
 * behaviours store.ts depends on, and the test asserts against real files on disk.
 */

let userData: string
let configPath: string
let optionsSeen: Record<string, unknown>[] = []
/** Set to make the next constructor throw a non-SyntaxError, like EPERM would. */
let nextConstructorError: Error | null = null

class FakeStore {
  constructor(options: Record<string, unknown>) {
    optionsSeen.push(options)
    if (nextConstructorError) {
      const error = nextConstructorError
      nextConstructorError = null
      throw error
    }
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8')
      if (raw.trim()) {
        try {
          this.value = JSON.parse(raw)
        } catch {
          // conf's real behaviour: a parse failure throws unless clearInvalidConfig.
          if (!options['clearInvalidConfig']) {
            throw new SyntaxError(`Unexpected token in JSON at position 0 in ${configPath}`)
          }
          this.value = {}
        }
      } else {
        // A zero-length file parses to nothing at all.
        if (!options['clearInvalidConfig']) throw new SyntaxError('Unexpected end of JSON input')
        this.value = {}
      }
    } else {
      this.value = {}
    }
  }

  private value: Record<string, unknown>

  get store(): Record<string, unknown> {
    return this.value
  }

  set(value: Record<string, unknown>): void {
    this.value = value
    writeFileSync(configPath, JSON.stringify(value), 'utf8')
  }
}

const reliability: { op: string; ok: boolean; detail?: string }[] = []

vi.mock('electron-store', () => ({ default: FakeStore }))
vi.mock('electron', () => ({ app: { getPath: () => userData } }))
vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({
  logReliabilityEvent: (event: { op: string; ok: boolean; detail?: string }) => {
    reliability.push(event)
  }
}))

const { getConfig, loadConfig, resetConfigCacheForTests, setConfig } =
  await import('../../src/main/config/store')

beforeEach(() => {
  reliability.length = 0
  optionsSeen = []
  nextConstructorError = null
  resetConfigCacheForTests()
  userData = mkdtempSync(join(tmpdir(), 'grammieguide-store-'))
  configPath = join(userData, 'grammieguide-config.json')
})

afterEach(() => {
  resetConfigCacheForTests()
  rmSync(userData, { recursive: true, force: true })
})

const resets = (): typeof reliability => reliability.filter((event) => event.op === 'config-reset')

describe('config store recovery', () => {
  it('starts from defaults on a fresh install without recording a reset', () => {
    const config = loadConfig()
    expect(config.schemaVersion).toBeGreaterThan(0)
    expect(config.tiles).toEqual([])
    expect(resets()).toHaveLength(0)
  })

  it('does not build the Store until it is needed', () => {
    // store.ts is imported at the top of index.ts, before app.whenReady. Opening
    // the file at module load is exactly what made a bad file fatal.
    expect(optionsSeen).toHaveLength(0)
    loadConfig()
    expect(optionsSeen).toHaveLength(1)
  })

  it.each([
    ['truncated', '{"schemaVersion": 7, "tiles": ['],
    ['zero length', ''],
    ['not json at all', 'this is not json'],
    ['hand edited into nonsense', '{"schemaVersion": "seven"}']
  ])('boots from defaults when the file is %s', (_label, contents) => {
    writeFileSync(configPath, contents, 'utf8')

    const config = loadConfig()

    // The important part: it booted at all.
    expect(config.schemaVersion).toBeGreaterThan(0)
    expect(config.tiles).toEqual([])
    expect(resets()).toHaveLength(1)
    expect(resets()[0]!.ok).toBe(false)
  })

  it('reopens with clearInvalidConfig only after copying the file aside', () => {
    writeFileSync(configPath, '{ broken', 'utf8')
    loadConfig()
    // First attempt must not clear anything; only the retry may.
    expect(optionsSeen[0]!['clearInvalidConfig']).toBeFalsy()
    expect(optionsSeen[1]!['clearInvalidConfig']).toBe(true)
  })

  it('keeps a byte-for-byte copy of the unreadable file', () => {
    const contents = '{"schemaVersion": 7, "tiles": ['
    writeFileSync(configPath, contents, 'utf8')

    loadConfig()

    const backup = readdirSync(userData).find((name) => name.startsWith('config.corrupt-'))
    expect(backup).toBeDefined()
    // A copy, not a re-serialised dump: the point is to keep what actually failed.
    expect(readFileSync(join(userData, backup!), 'utf8')).toBe(contents)
  })

  it('never puts config contents or a V8 parse message in the log', () => {
    // V8 quotes the offending source inside a SyntaxError message, so the detail
    // must not be built from the error text.
    const secret = 'sk-ant-should-never-be-logged'
    writeFileSync(configPath, `{"anthropicApiKey": "${secret}" oops`, 'utf8')

    loadConfig()

    expect(resets()).toHaveLength(1)
    const detail = resets()[0]!.detail ?? ''
    expect(detail).toBeTruthy()
    expect(detail).not.toContain(secret)
    expect(detail).not.toContain('Unexpected token')
    expect(detail).not.toContain('position')
  })

  it('names the reason and the backup file, and keeps seeded secrets out of both', () => {
    // A migration whose TypeError quotes the value it choked on: the reason is
    // rebuilt from a fixed vocabulary so nothing from the file survives.
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 3,
        tiles: 'not-an-array',
        buddy: { anthropicApiKey: 'sk-ant-SECRET' },
        reliability: { adminPinHash: 'HASHSECRET' }
      }),
      'utf8'
    )

    loadConfig()

    expect(resets()).toHaveLength(1)
    const detail = resets()[0]!.detail ?? ''
    // Names the offending field...
    expect(detail).toContain('tiles')
    // ...and the backup that was kept, so the caregiver can find it.
    expect(detail).toMatch(/config\.corrupt-\d+\.json/)
    // ...but none of the three seeded secrets.
    expect(detail).not.toContain('sk-ant-SECRET')
    expect(detail).not.toContain('HASHSECRET')
    expect(detail).not.toContain('not-an-array')
  })

  it('records one reset event and keeps working for every later caller', () => {
    // The real write paths, each of which must still succeed after validation.
    writeFileSync(configPath, '{ broken', 'utf8')
    loadConfig()

    // A tile array edit.
    setConfig({
      tiles: [
        {
          id: 'a',
          type: 'web',
          label: 'Weather',
          size: 'normal',
          colorIndex: 0,
          url: 'https://x.test'
        }
      ]
    })
    // An admin:setApiKey-style buddy patch.
    setConfig({ buddy: { ...getConfig().buddy, anthropicApiKey: 'sk-real' } })
    // An adminAuth setPin-style reliability patch: hash and salt together.
    setConfig({ reliability: { adminPinHash: 'hash', adminPinSalt: 'salt' } })
    // An old-launcher-import-style multi-section patch.
    setConfig({
      weather: { locations: [{ id: 'w', label: 'Sheffield' }], units: 'metric' },
      display: { ...getConfig().display, volumeCeiling: 55 },
      confusion: { ...getConfig().confusion, inactivityTimeoutMinutes: 5 }
    })
    // kioskServices sets the Wi-Fi adapter, then clears it back to undefined.
    setConfig({ reliability: { ...getConfig().reliability, wifiAdapterName: 'Wi-Fi' } })
    setConfig({ reliability: { ...getConfig().reliability, wifiAdapterName: undefined } })

    resetConfigCacheForTests()
    const reloaded = loadConfig()
    expect(reloaded.tiles).toHaveLength(1)
    expect(reloaded.buddy.anthropicApiKey).toBe('sk-real')
    expect(reloaded.reliability.adminPinHash).toBe('hash')
    expect(reloaded.reliability.wifiAdapterName).toBeUndefined()
    expect(reloaded.weather.units).toBe('metric')
    expect(reloaded.display.volumeCeiling).toBe(55)
    expect(reloaded.confusion.inactivityTimeoutMinutes).toBe(5)
    // The reset was recorded once, at the start, not per write.
    expect(resets()).toHaveLength(1)
  })

  it('rethrows a read failure that is not a parse error', () => {
    // EPERM/EBUSY is not the file's fault. Silently starting from defaults would
    // hide a real disk problem, so it must still surface.
    writeFileSync(configPath, '{}', 'utf8')
    nextConstructorError = Object.assign(new Error('EPERM'), { code: 'EPERM' })
    expect(() => loadConfig()).toThrow('EPERM')
    expect(resets()).toHaveLength(0)
  })

  it('is usable afterwards: saves work and survive a fresh read', () => {
    writeFileSync(configPath, '{ broken', 'utf8')
    loadConfig()

    setConfig({ display: { ...getConfig().display, volumeCeiling: 33 } })

    // A new cache, as if the app restarted.
    resetConfigCacheForTests()
    expect(loadConfig().display.volumeCeiling).toBe(33)
    // The reset was recorded once, not on every later read.
    expect(resets()).toHaveLength(1)
  })

  it('preserves a valid file and never rewrites it as defaults', () => {
    setConfig({ display: { ...getConfig().display, volumeCeiling: 44 } })
    expect(JSON.parse(readFileSync(configPath, 'utf8')).display.volumeCeiling).toBe(44)

    resetConfigCacheForTests()
    expect(loadConfig().display.volumeCeiling).toBe(44)
    expect(resets()).toHaveLength(0)
    expect(readdirSync(userData).some((name) => name.startsWith('config.corrupt-'))).toBe(false)
  })

  it('refuses an invalid write without touching the cache or the file', () => {
    loadConfig()
    const before = readFileSync(configPath, 'utf8')

    expect(() => setConfig({ display: { ...getConfig().display, volumeCeiling: 9999 } })).toThrow(
      /could not be saved/
    )

    expect(readFileSync(configPath, 'utf8')).toBe(before)
    expect(getConfig().display.volumeCeiling).not.toBe(9999)
  })

  it('does not create a corrupt-copy when there was never a file', () => {
    loadConfig()
    expect(existsSync(configPath)).toBe(true)
    expect(readdirSync(userData).some((name) => name.startsWith('config.corrupt-'))).toBe(false)
  })
})
