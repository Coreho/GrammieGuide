import { describe, it, expect } from 'vitest'
import { planOldLauncherImport } from '../../src/main/config/importOldLauncher'
import { defaultConfig } from '../../src/shared/configSchema'

// Shape of grandmas-launcher's electron-store config.json (secrets stubbed).
const OLD = {
  tiles: [{ id: 'news', type: 'web', icon: '📰', label: 'News', target: 'https://apnews.com' }],
  weather: { location: 'Hamilton, Bermuda', unit: 'F', locations: [] },
  display: { launcherDisplay: 0, adminDisplay: 1, fontScale: 'large', volumeLevel: 40, ambientBackground: false },
  confusion: { inactivityMinutes: 10, rapidTapCount: 15, rapidTapWindowMs: 3000, inactivityEnabled: true, rapidTapEnabled: true },
  adminPin: 'old-secret',
  ai: { openrouterKey: 'sk-or-old' }
}

describe('import settings from grandmas-launcher', () => {
  it('carries over text size, volume, weather and confusion settings', () => {
    const { patch, preview } = planOldLauncherImport(OLD, defaultConfig())
    expect(patch.display).toMatchObject({ fontStep: 1, volumeCeiling: 40, ambientBackground: false })
    expect(patch.weather.locations.map((l) => l.label)).toEqual(['Hamilton, Bermuda'])
    expect(patch.weather.units).toBe('imperial')
    expect(patch.confusion.inactivityTimeoutMinutes).toBe(10)
    expect(patch.confusion.rapidTap).toMatchObject({ count: 15, windowMs: 3000 })
    expect(preview.settings.length).toBeGreaterThan(0)
  })

  it('never brings tiles over - Home is set up fresh', () => {
    const plan = planOldLauncherImport(OLD, defaultConfig())
    expect(Object.keys(plan.patch).sort()).toEqual(['confusion', 'display', 'weather'])
    expect(plan.preview.notImported.some((line) => /Tiles/.test(line))).toBe(true)
  })

  it('never carries secrets over', () => {
    const plan = planOldLauncherImport(OLD, defaultConfig())
    expect(JSON.stringify(plan.patch)).not.toMatch(/old-secret|sk-or-old/)
  })

  it('keeps an existing weather location instead of replacing it', () => {
    const cfg = defaultConfig()
    cfg.weather.locations = [{ id: 'x', label: 'Boston' }]
    expect(planOldLauncherImport(OLD, cfg).patch.weather.locations.map((l) => l.label)).toEqual(['Boston'])
  })

  it('copes with garbage without throwing', () => {
    const plan = planOldLauncherImport({ display: { fontScale: 'huge', volumeLevel: 900 } }, defaultConfig())
    expect(plan.patch.display.fontStep).toBe(defaultConfig().display.fontStep)
    expect(plan.patch.display.volumeCeiling).toBe(100)
  })
})
