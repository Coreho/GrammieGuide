import { describe, expect, it } from 'vitest'
import {
  advanceMusicQueue,
  createMusicQueue,
  musicDeadline,
  musicExpired
} from '../../src/shared/music/queue'

describe('offline playlist queue', () => {
  it('wraps in order and keeps a single track playing', () => {
    let queue = createMusicQueue(['a', 'b'], false)
    queue = advanceMusicQueue(queue)!
    expect(queue.index).toBe(1)
    expect(advanceMusicQueue(queue)!.index).toBe(0)
    expect(advanceMusicQueue(createMusicQueue(['a'], false))!.index).toBe(0)
  })
  it('shuffles one cycle without duplicates or losing tracks', () => {
    const queue = createMusicQueue(['a', 'b', 'c', 'a'], true, () => 0)
    expect(queue.ids).toEqual(['b', 'c', 'a'])
    expect(new Set(queue.ids).size).toBe(3)
  })
  it('gives up after each track fails once, and a successful track resets the failure count', () => {
    const first = createMusicQueue(['a', 'b'], false)
    const failed = advanceMusicQueue(first, true)!
    expect(advanceMusicQueue(failed, true)).toBeNull()
    expect(advanceMusicQueue(failed)!.failures).toBe(0)
    expect(advanceMusicQueue(createMusicQueue([], false))).toBeNull()
  })
  it('stops at the exact caregiver deadline', () => {
    const deadline = musicDeadline(100, 90)
    expect(musicExpired(deadline, deadline - 1)).toBe(false)
    expect(musicExpired(deadline, deadline)).toBe(true)
    expect(musicExpired(null, Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})
