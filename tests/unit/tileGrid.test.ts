import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Tile } from '../../src/shared/configSchema'
import {
  availableSlots,
  chooseLayoutForTiles,
  placeTilesInOrder,
  preserveTileSlots,
  slotFits
} from '../../src/shared/homeLayout'
import { TileGrid } from '../../src/renderer/launcher/src/components/TileGrid'

const tile = (id: string, slot: number | null, size: Tile['size'] = 'normal'): Tile => ({
  id,
  label: id,
  type: 'web',
  size,
  slot,
  colorIndex: 0
})

describe('fixed Home placement', () => {
  it('chooses the four-space layout for up to four cells and the denser layout after that', () => {
    expect(chooseLayoutForTiles([tile('a', null), tile('b', null, 'wide')])).toBe('simple4')
    expect(
      chooseLayoutForTiles([tile('a', null, 'wide'), tile('b', null, 'wide'), tile('c', null)])
    ).toBe('more8')
  })

  it('keeps wide tiles in one row and finds only adjacent two-space openings', () => {
    expect(slotFits('simple4', 0, 'wide')).toBe(true)
    expect(slotFits('simple4', 1, 'wide')).toBe(false)
    expect(slotFits('simple4', 2, 'wide')).toBe(true)
    expect(availableSlots('simple4', [tile('a', 0)], 'wide')).toEqual([2])
  })

  it('assigns in order, carries excess tiles as overflow, and does not compact holes', () => {
    const placed = placeTilesInOrder('simple4', [
      tile('a', null, 'wide'),
      tile('b', null),
      tile('c', null),
      tile('overflow', null)
    ])
    expect(placed.map(({ slot }) => slot)).toEqual([0, 2, 3, null])
    expect(
      preserveTileSlots(
        'simple4',
        placed.filter(({ id }) => id !== 'b')
      )
    ).toEqual([placed[0], placed[2], placed[3]])
  })

  it('rejects overlaps without moving the first valid tile', () => {
    expect(
      preserveTileSlots('more8', [
        tile('first', 0, 'wide'),
        tile('overlap', 1),
        tile('last', 7)
      ]).map(({ slot }) => slot)
    ).toEqual([0, null, 7])
  })
})

describe('fixed Home grid', () => {
  it('renders explicit positions, preserves holes, hides overflow, and never scrolls', () => {
    const html = renderToStaticMarkup(
      createElement(TileGrid, {
        layout: 'simple4',
        tiles: [tile('First', 0), tile('Last', 3), tile('Overflow', null)],
        onActivate: () => {}
      })
    )
    expect(html).toContain('grid-template-columns:repeat(2')
    expect(html).toContain('grid-template-rows:repeat(2')
    expect(html).toContain('overflow:hidden')
    expect(html).toContain('data-tile-slot="0"')
    expect(html).toContain('data-tile-slot="3"')
    expect(html).not.toContain('aria-label="Overflow"')
  })

  it('keeps each rendered background and ink when the config array is reordered', () => {
    const tiles: Tile[] = [
      { ...tile('Family', 0), colorIndex: 3 },
      { ...tile('Weather', 2, 'wide'), type: 'builtin', colorIndex: 0 }
    ]
    const styles = (items: Tile[]): Record<string, string> => {
      const html = renderToStaticMarkup(
        createElement(TileGrid, { layout: 'simple4', tiles: items, onActivate: () => {} })
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
  })
})
