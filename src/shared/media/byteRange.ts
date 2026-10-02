export interface ByteRange {
  start: number
  end: number
}

// null means no Range header; 'invalid' covers malformed and unsatisfiable ranges.
export function parseByteRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) {
    return 'invalid'
  }
  const first = match[1] ? Number(match[1]) : null
  const last = match[2] ? Number(match[2]) : null
  if (
    (first !== null && !Number.isSafeInteger(first)) ||
    (last !== null && !Number.isSafeInteger(last))
  ) {
    return 'invalid'
  }
  if (first === null) {
    if (last === null || last === 0) return 'invalid'
    return { start: Math.max(0, size - last), end: size - 1 }
  }
  if (first >= size || (last !== null && last < first)) return 'invalid'
  return { start: first, end: Math.min(last ?? size - 1, size - 1) }
}
