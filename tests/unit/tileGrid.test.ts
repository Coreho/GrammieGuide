import { describe, it, expect } from 'vitest'
import { columnsFor } from '../../src/renderer/launcher/src/components/TileGrid'

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
