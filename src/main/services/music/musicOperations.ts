let queue: Promise<unknown> = Promise.resolve()

/** Music handlers and the older library bridge must not race playlist writes against deletion. */
export function runMusicOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = queue.then(operation)
  queue = pending.catch(() => undefined)
  return pending
}
