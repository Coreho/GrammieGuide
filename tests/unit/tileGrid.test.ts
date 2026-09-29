import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Tile } from '../../src/shared/configSchema'
import { columnsFor, TileGrid } from '../../src/renderer/launcher/src/components/TileGrid'

describe('columnsFor', () => {
  it.each([
    [0, 1],
    [1, 1],
    [4, 4],
    [5, 3],
    [6, 3],
    [7, 4],
    [8, 4],
    [12, 4]
  ])('%i tiles -> %i columns', (count, columns) => {
    expect(columnsFor(count)).toBe(columns)
  })
})

describe('tile colors on Home', () => {
  it('keeps each rendered background and ink after reorder, edit, addition and removal', () => {
    const tiles: Tile[] = [
      { id: 'a', label: 'Family', type: 'web', size: 'normal', colorIndex: 3 },
      { id: 'b', label: 'Weather', type: 'builtin', size: 'wide', colorIndex: 0 }
    ]
    const styles = (items: Tile[]): Record<string, string> => {
      const html = renderToStaticMarkup(
        createElement(TileGrid, { tiles: items, onActivate: () => {} })
      )
      return Object.fromEntries(
        [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*style="([^"]+)"/g)].map(
          ([, label, style]) => [
            label,
            style!.match(/(?:^|;)(?:color|background):[^;]+/g)!.join(';')
          ]
        )
      )
    }
    const before = styles(tiles)
    expect(before.Family).toContain('--tile4')
    expect(before.Weather).toContain('--tInk1')
    expect(styles([...tiles].reverse())).toEqual(before)
    const edited = [{ ...tiles[1]!, label: 'Forecast' }, tiles[0]!]
    expect(styles(edited).Family).toBe(before.Family)
    const added: Tile = { id: 'c', label: 'News', type: 'web', size: 'normal', colorIndex: 1 }
    expect(styles([added, ...tiles])).toMatchObject(before)
    expect(styles([tiles[0]!]).Family).toBe(before.Family)
  })
})
