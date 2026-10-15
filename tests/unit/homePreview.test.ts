import { describe, expect, it, vi } from 'vitest'
import {
  applyPreviewThemeToElement,
  buildPreviewCssVariables,
  THEME_ONLY_KEYS,
  THEMES
} from '../../src/shared/theme'

describe('home preview theme styling', () => {
  it('builds CSS variables dictionary including font scale and theme tokens', () => {
    const varsStep0 = buildPreviewCssVariables('tilesBold', 0)
    expect(varsStep0['--font-scale']).toBe('1')
    expect(varsStep0['--page']).toBe(THEMES.tilesBold.page)
    expect(varsStep0['--ink']).toBe(THEMES.tilesBold.ink)
    expect(varsStep0['--tile1']).toBe(THEMES.tilesBold.tile1)

    const varsStep3 = buildPreviewCssVariables('clayCards', 3)
    expect(varsStep3['--font-scale']).toBe('1.45')
    expect(varsStep3['--card-art-size']).toBe('240px')
    expect(varsStep3['--card-label-size']).toBe('72px')

    // Mint does not specify card-art-size or category-card-gap
    const varsMint = buildPreviewCssVariables('mint', 2)
    expect(varsMint['--font-scale']).toBe('1.3')
    expect(varsMint['--card-art-size']).toBeUndefined()
  })

  it('clamps out-of-range font step indices gracefully', () => {
    expect(buildPreviewCssVariables('tilesBold', -5)['--font-scale']).toBe('1')
    expect(buildPreviewCssVariables('tilesBold', 100)['--font-scale']).toBe('1.6')
  })

  it('clears all THEME_ONLY_KEYS before applying new theme variables', () => {
    const removed: string[] = []
    const set: Record<string, string> = {}

    const mockElement = {
      style: {
        removeProperty: vi.fn((key: string) => {
          removed.push(key)
          delete set[key]
        }),
        setProperty: vi.fn((key: string, value: string) => {
          set[key] = value
        })
      }
    }

    // Step 1: apply clayCards
    applyPreviewThemeToElement(mockElement, 'clayCards', 0)
    expect(mockElement.style.removeProperty).toHaveBeenCalledTimes(THEME_ONLY_KEYS.length)
    for (const key of THEME_ONLY_KEYS) {
      expect(removed).toContain(`--${key}`)
    }
    expect(set['--card-art-size']).toBe('240px')
    expect(set['--font-scale']).toBe('1')

    // Step 2: apply mint (which does not have card-art-size)
    mockElement.style.removeProperty.mockClear()
    mockElement.style.setProperty.mockClear()
    applyPreviewThemeToElement(mockElement, 'mint', 4)

    // All THEME_ONLY_KEYS must be cleared again
    expect(mockElement.style.removeProperty).toHaveBeenCalledTimes(THEME_ONLY_KEYS.length)
    expect(mockElement.style.removeProperty).toHaveBeenCalledWith('--card-art-size')
    expect(mockElement.style.removeProperty).toHaveBeenCalledWith('--category-card-gap')
    expect(mockElement.style.setProperty).toHaveBeenCalledWith('--font-scale', '1.6')
    expect(mockElement.style.setProperty).toHaveBeenCalledWith('--page', THEMES.mint.page)
    // And setProperty must NOT have been called with card-art-size for mint
    expect(mockElement.style.setProperty).not.toHaveBeenCalledWith('--card-art-size', expect.anything())
  })
})
