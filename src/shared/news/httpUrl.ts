/** Shared by feed parsing, main's fetch boundary, and the caregiver form. */
export function httpUrl(value: string | undefined, base?: string): string | null {
  if (!value?.trim()) return null
  try {
    const url = base ? new URL(value.trim(), base) : new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
