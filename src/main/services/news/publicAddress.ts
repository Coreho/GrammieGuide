import { isIP } from 'node:net'

/** Fail closed on special-use space: a publisher's thumbnail must stay on the public Internet. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number) as [number, number, number, number]
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
  }
  if (family !== 6 || address.includes('%')) return false
  // Normalize compressed and dotted IPv4 tails before testing IPv6 prefixes.
  let normalized = address.toLowerCase()
  if (normalized.includes('.')) {
    const colon = normalized.lastIndexOf(':')
    const octets = normalized
      .slice(colon + 1)
      .split('.')
      .map(Number)
    normalized =
      normalized.slice(0, colon + 1) +
      ((octets[0]! << 8) | octets[1]!).toString(16) +
      ':' +
      ((octets[2]! << 8) | octets[3]!).toString(16)
  }
  const [left, right] = normalized.split('::')
  const head = left ? left.split(':') : []
  const tail = right ? right.split(':') : []
  const words = (
    right === undefined
      ? head
      : [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail]
  ).map((word) => parseInt(word, 16))
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isPublicAddress(
      [words[6]! >> 8, words[6]! & 255, words[7]! >> 8, words[7]! & 255].join('.')
    )
  }
  // Only global unicast (2000::/3), excluding protocol assignments, documentation
  // and 6to4. This also rejects local, multicast and address-translation prefixes.
  return (
    (words[0]! & 0xe000) === 0x2000 &&
    !(words[0] === 0x2001 && words[1]! < 0x0200) &&
    !(words[0] === 0x2001 && words[1] === 0x0db8) &&
    words[0] !== 0x2002 &&
    !(words[0] === 0x3fff && (words[1]! & 0xf000) === 0)
  )
}
