import { describe, expect, it } from 'vitest'
import {
  KNITTING_REPEAT_GUARD_MS,
  MAX_KNITTING_ROWS,
  changeRows,
  knittingProjectInputSchema,
  type KnittingProject
} from '../../src/shared/knitting/knitting'

const project = (rows: number, lastChange?: KnittingProject['lastChange']): KnittingProject => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Scarf',
  forWhom: 'Tom',
  rows,
  ...(lastChange && { lastChange })
})

describe('knitting row counter', () => {
  it('adds and takes away one row at a time', () => {
    expect(changeRows(project(4), 'add', 10_000).rows).toBe(5)
    expect(changeRows(project(4), 'remove', 10_000).rows).toBe(3)
  })

  it('counts a quick double tap the same way as one row', () => {
    const once = changeRows(project(4), 'add', 10_000)
    const twice = changeRows(once, 'add', 10_000 + KNITTING_REPEAT_GUARD_MS - 1)
    expect(twice).toBe(once)
    expect(twice.rows).toBe(5)
  })

  it('counts the next row once the guard has passed', () => {
    const once = changeRows(project(4), 'add', 10_000)
    expect(changeRows(once, 'add', 10_000 + KNITTING_REPEAT_GUARD_MS).rows).toBe(6)
  })

  it('never holds back a correction the other way', () => {
    const added = changeRows(project(4), 'add', 10_000)
    expect(changeRows(added, 'remove', 10_050).rows).toBe(4)
  })

  it('does not hold back a tap after the clock went backwards', () => {
    const added = changeRows(project(4), 'add', 10_000)
    expect(changeRows(added, 'add', 5_000).rows).toBe(6)
  })

  it('stops at zero and at the largest count, leaving the project untouched', () => {
    const empty = project(0)
    expect(changeRows(empty, 'remove', 10_000)).toBe(empty)
    const full = project(MAX_KNITTING_ROWS)
    expect(changeRows(full, 'add', 10_000)).toBe(full)
  })
})

describe('caregiver project input', () => {
  it('trims the details and keeps the count unless asked to start over', () => {
    expect(knittingProjectInputSchema.parse({ name: '  Scarf ', forWhom: ' Tom ' })).toEqual({
      name: 'Scarf',
      forWhom: 'Tom',
      startNew: false
    })
  })

  it('needs a name and accepts only a managed photo ID', () => {
    expect(knittingProjectInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(
      knittingProjectInputSchema.safeParse({ name: 'Scarf', photoId: 'file:///private.jpg' })
        .success
    ).toBe(false)
    expect(knittingProjectInputSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false)
  })
})
