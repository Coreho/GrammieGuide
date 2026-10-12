export const HOME_LAYOUT_NAMES = ['simple4', 'more8'] as const

export type HomeLayoutName = (typeof HOME_LAYOUT_NAMES)[number]
export type TileSize = 'normal' | 'wide'

export interface HomeLayoutDefinition {
  label: string
  description: string
  columns: number
  rows: number
  capacity: number
  labelMax: number
}

export const HOME_LAYOUTS: Record<HomeLayoutName, HomeLayoutDefinition> = {
  simple4: {
    label: 'Simple four',
    description: 'Four large spaces in two rows.',
    columns: 2,
    rows: 2,
    capacity: 4,
    labelMax: 28
  },
  more8: {
    label: 'More choices',
    description: 'Eight smaller spaces in two rows.',
    columns: 4,
    rows: 2,
    capacity: 8,
    labelMax: 18
  }
}

export interface SlottedTile {
  id: string
  size: TileSize
  slot?: number | null
}

export function slotsForSize(size: TileSize): number {
  return size === 'wide' ? 2 : 1
}

/** A wide tile consumes two adjacent spaces and may never cross a row boundary. */
export function slotFits(layoutName: HomeLayoutName, slot: number, size: TileSize): boolean {
  const layout = HOME_LAYOUTS[layoutName]
  const width = slotsForSize(size)
  return (
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot + width <= layout.capacity &&
    Math.floor(slot / layout.columns) === Math.floor((slot + width - 1) / layout.columns)
  )
}

export function occupiedSlots(
  layoutName: HomeLayoutName,
  tile: Pick<SlottedTile, 'size' | 'slot'>
): number[] {
  if (
    tile.slot === null ||
    tile.slot === undefined ||
    !slotFits(layoutName, tile.slot, tile.size)
  ) {
    return []
  }
  return Array.from({ length: slotsForSize(tile.size) }, (_, offset) => tile.slot! + offset)
}

export function availableSlots(
  layoutName: HomeLayoutName,
  tiles: readonly SlottedTile[],
  size: TileSize,
  excludeId?: string
): number[] {
  const occupied = new Set(
    tiles.filter((tile) => tile.id !== excludeId).flatMap((tile) => occupiedSlots(layoutName, tile))
  )
  const starts: number[] = []
  for (let slot = 0; slot < HOME_LAYOUTS[layoutName].capacity; slot += 1) {
    if (
      slotFits(layoutName, slot, size) &&
      Array.from({ length: slotsForSize(size) }, (_, offset) => slot + offset).every(
        (cell) => !occupied.has(cell)
      )
    ) {
      starts.push(slot)
    }
  }
  return starts
}

/**
 * Keeps valid permanent positions and turns invalid or overlapping entries into
 * overflow. It deliberately does not fill holes: removing a tile must not make
 * the remaining Home choices move underneath her.
 */
export function preserveTileSlots<T extends SlottedTile>(
  layoutName: HomeLayoutName,
  tiles: readonly T[]
): Array<T & { slot: number | null }> {
  const occupied = new Set<number>()
  return tiles.map((tile) => {
    const cells = occupiedSlots(layoutName, tile)
    if (cells.length === 0 || cells.some((slot) => occupied.has(slot))) {
      return { ...tile, slot: null }
    }
    for (const slot of cells) occupied.add(slot)
    return { ...tile, slot: tile.slot! }
  })
}

/** Assigns every tile in order to the first place it fits; excess tiles survive as overflow. */
export function placeTilesInOrder<T extends SlottedTile>(
  layoutName: HomeLayoutName,
  tiles: readonly T[]
): Array<T & { slot: number | null }> {
  const placed: Array<T & { slot: number | null }> = []
  for (const tile of tiles) {
    const slot = availableSlots(layoutName, placed, tile.size)[0] ?? null
    placed.push({ ...tile, slot })
  }
  return placed
}

export function tilesInHome<T extends SlottedTile>(
  layoutName: HomeLayoutName,
  tiles: readonly T[]
): Array<T & { slot: number }> {
  return preserveTileSlots(layoutName, tiles)
    .filter((tile): tile is T & { slot: number } => tile.slot !== null)
    .sort((a, b) => a.slot - b.slot)
}

export function chooseLayoutForTiles(tiles: readonly Pick<SlottedTile, 'size'>[]): HomeLayoutName {
  const cells = tiles.reduce((total, tile) => total + slotsForSize(tile.size), 0)
  return cells <= HOME_LAYOUTS.simple4.capacity ? 'simple4' : 'more8'
}

export function slotDescription(layoutName: HomeLayoutName, slot: number): string {
  const { columns } = HOME_LAYOUTS[layoutName]
  return `Row ${Math.floor(slot / columns) + 1}, position ${(slot % columns) + 1}`
}
