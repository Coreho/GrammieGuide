export interface MusicQueue {
  ids: string[]
  index: number
  failures: number
}

/** Shuffle once per choice, keeping every track exactly once in the cycle. */
export function createMusicQueue(
  ids: readonly string[],
  shuffle: boolean,
  random = Math.random
): MusicQueue {
  const ordered = [...new Set(ids)]
  if (shuffle) {
    for (let index = ordered.length - 1; index > 0; index--) {
      const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))))
      ;[ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!]
    }
  }
  return { ids: ordered, index: 0, failures: 0 }
}
export function advanceMusicQueue(queue: MusicQueue, failed = false): MusicQueue | null {
  if (!queue.ids.length) return null
  const failures = failed ? queue.failures + 1 : 0
  if (failures >= queue.ids.length) return null
  return { ...queue, index: (queue.index + 1) % queue.ids.length, failures }
}
export function musicDeadline(start: number, minutes: number): number {
  return start + minutes * 60_000
}
export function musicExpired(deadline: number | null, now: number): boolean {
  return deadline !== null && now >= deadline
}
