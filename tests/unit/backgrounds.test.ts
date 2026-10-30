import { describe, expect, it } from 'vitest'
import {
  BACKGROUNDS,
  BACKGROUND_NAMES,
  THEMES,
  THEME_NAMES,
  THEME_TONES,
  backgroundsFor,
  buildPreviewCssVariables,
  themeTokens
} from '../../src/shared/theme'
import { displayConfigSchema } from '../../src/shared/configSchema'

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

describe('background presets', () => {
  it('sorts each theme as light or dark by its own background', () => {
    for (const theme of THEME_NAMES) {
      expect(luminance(THEMES[theme].bgB!) > 0.5 ? 'light' : 'dark').toBe(THEME_TONES[theme])
    }
  })

  it('keeps every theme text color readable on every preset it offers (WCAG AA)', () => {
    for (const theme of THEME_NAMES) {
      const { ink, ink2 } = THEMES[theme]
      for (const name of backgroundsFor(theme)) {
        for (const shade of ['bgA', 'bgB', 'bgC'] as const) {
          expect(contrast(ink!, BACKGROUNDS[name][shade])).toBeGreaterThanOrEqual(4.5)
          expect(contrast(ink2!, BACKGROUNDS[name][shade])).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('offers light presets with light themes and dark presets with dark themes', () => {
    expect(backgroundsFor('butter')).toEqual(['cream', 'sage', 'softBlue', 'blush', 'lavender'])
    expect(backgroundsFor('tilesBold')).toEqual([
      'midnight',
      'forest',
      'plum',
      'charcoal',
      'deepTeal'
    ])
    for (const name of BACKGROUND_NAMES) {
      expect(THEME_NAMES.some((theme) => backgroundsFor(theme).includes(name))).toBe(true)
    }
  })

  it("replaces only the theme's background, and only where it suits the theme", () => {
    const plum = themeTokens('tilesBold', 'plum')
    expect(plum).toEqual({ ...THEMES.tilesBold, ...pick(BACKGROUNDS.plum) })
    expect(themeTokens('butter', 'plum')).toBe(THEMES.butter)
    expect(themeTokens('butter')).toBe(THEMES.butter)
    expect(buildPreviewCssVariables('tilesBold', 0, 'plum')['--bgB']).toBe('#2E2034')
    expect(buildPreviewCssVariables('butter', 0, 'plum')['--bgB']).toBe(THEMES.butter.bgB)
  })
})

function pick({ page, bgA, bgB, bgC }: (typeof BACKGROUNDS)['plum']): Record<string, string> {
  return { page, bgA, bgB, bgC }
}

describe('saved background setting', () => {
  it('is optional, so a config from before it keeps the theme background', () => {
    expect(displayConfigSchema.parse({}).background).toBeUndefined()
    expect(displayConfigSchema.parse({ background: 'plum' }).background).toBe('plum')
  })

  it('drops a name it does not know instead of failing her whole config', () => {
    const parsed = displayConfigSchema.safeParse({ theme: 'butter', background: 'neon' })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toMatchObject({ theme: 'butter' })
    expect(parsed.data!.background).toBeUndefined()
  })
})
