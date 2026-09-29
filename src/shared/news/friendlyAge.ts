/** Missing or invalid dates are omitted instead of inventing an age. */
export function friendlyAge(publishedAt: string | null, now: number): string {
  if (!publishedAt) return ''
  const published = Date.parse(publishedAt)
  if (!Number.isFinite(published) || !Number.isFinite(now)) return ''
  const minutes = Math.floor(Math.max(0, now - published) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}
