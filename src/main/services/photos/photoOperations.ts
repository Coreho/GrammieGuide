let pending: Promise<unknown> = Promise.resolve()
/** Photo removal and narration replacement must not leave an audio reference to a removed photo. */
export function runPhotoOperation<T>(work: () => Promise<T>): Promise<T> {
  const next = pending.then(work, work)
  pending = next.catch(() => {})
  return next
}
