import type { Tile } from '../configSchema'

export const MAX_APPROVED_SITES = 100
export const MAX_SITE_LENGTH = 253

// Never guess a registrable domain by taking the last two labels: that would
// turn www.bbc.co.uk into permission for all of co.uk. Keep the saved host,
// removing only www, and refuse entries that are only a shared ending. This
// is a hand-kept list of the common ones, not the full Public Suffix List; a
// guessing rule (two-letter country code after a short name) also refused
// real sites such as cbc.ca, nos.nl and web.de, which blocked their tiles.
const SHARED_SUFFIXES = new Set([
  // Hosting platforms where every customer gets a subdomain.
  'github.io',
  'blogspot.com',
  'appspot.com',
  'pages.dev',
  'vercel.app',
  'netlify.app',
  // Country second levels: anyone can register beneath these.
  ...['co', 'org', 'me', 'ltd', 'plc', 'net', 'ac', 'gov', 'nhs', 'sch', 'police'].map(
    (part) => `${part}.uk`
  ),
  ...['com', 'net', 'org', 'edu', 'gov', 'asn', 'id'].map((part) => `${part}.au`),
  ...['co', 'org', 'net', 'govt', 'ac', 'school'].map((part) => `${part}.nz`),
  ...['co', 'org', 'gov', 'net', 'ac'].map((part) => `${part}.za`),
  ...['ab', 'bc', 'mb', 'nb', 'nf', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yk'].map(
    (province) => `${province}.ca`
  ),
  ...['co', 'or', 'ne', 'ac', 'go'].map((part) => `${part}.jp`),
  ...['co', 'go', 'or'].map((part) => `${part}.kr`),
  ...['co', 'go', 'or'].map((part) => `${part}.id`),
  ...['co', 'gov', 'org', 'ac'].map((part) => `${part}.il`),
  ...['co', 'gov', 'org', 'net'].map((part) => `${part}.in`),
  ...['com', 'gov', 'org', 'net', 'edu'].flatMap((part) =>
    ['br', 'mx', 'ar', 'cn', 'hk', 'sg', 'tr', 'tw', 'ph', 'my', 'ua', 'pl', 'es'].map(
      (country) => `${part}.${country}`
    )
  ),
  ...['gob.mx', 'gob.ar', 'gob.es']
])

function isIp(host: string): boolean {
  return host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)
}

export function normalizeSite(raw: string, stripWww = true): string | null {
  if (!raw || raw.length > MAX_SITE_LENGTH || /[\s/@?#\\%]/.test(raw)) return null
  const host = raw.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) {
    try {
      return new URL(`http://${host}`).hostname
    } catch {
      return null
    }
  }
  if (host.includes(':')) return null
  const labels = host.split('.')
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  if (isIp(host)) {
    return labels.every((label) => String(Number(label)) === label && Number(label) <= 255)
      ? host
      : null
  }
  if (/^[\d.]+$/.test(host)) return null
  const site = stripWww ? host.replace(/^www\./, '') : host
  if (site === 'localhost') return site
  if (site.split('.').length < 2 || SHARED_SUFFIXES.has(site)) return null
  return site
}

/**
 * The site to approve for a host: without www, or the exact host when that
 * would leave only a shared ending (www.gov.uk is a real site, gov.uk an
 * ending). Used for tiles, the caregiver's entries and saved config alike.
 */
export function siteFor(host: string): string | null {
  return normalizeSite(host) ?? normalizeSite(host, false)
}

export function webHostname(raw: string): string | null {
  try {
    if (!/^https?:\/\//i.test(raw) || /[\s\\]/.test(raw)) return null
    const url = new URL(raw)
    if (url.username || url.password) return null
    return url.hostname.toLowerCase().replace(/\.$/, '') || null
  } catch {
    return null
  }
}

export function siteMatches(host: string, site: string): boolean {
  return host === site || (!isIp(site) && site !== 'localhost' && host.endsWith(`.${site}`))
}

export function tileSites(tiles: readonly Tile[]): string[] {
  return [
    ...new Set(
      tiles.flatMap((tile) => {
        // The News fallback website is caregiver-saved too; feed hosts are not pages.
        if (tile.type !== 'web' && !(tile.type === 'builtin' && tile.builtinKey === 'news'))
          return []
        const host = tile.url && webHostname(tile.url)
        const site = host && siteFor(host)
        return site ? [site] : []
      })
    )
  ]
}

export type NavigationKind = 'open' | 'navigate' | 'redirect' | 'retry' | 'back'

export function navigationAllowed(
  url: string,
  config: { tiles: readonly Tile[]; approvedSites: readonly string[] },
  kind: NavigationKind,
  trustedPage: string | null = null
): boolean {
  const host = webHostname(url)
  if (!host) return false
  // Only main can choose this exact page. A redirect or page-initiated link
  // never inherits its exception, even when it stays on the story's host.
  if (kind !== 'navigate' && kind !== 'redirect' && trustedPage && url === trustedPage) return true
  const approved = config.approvedSites.flatMap((raw) => siteFor(raw) ?? [])
  return [...tileSites(config.tiles), ...approved].some((site) => siteMatches(host, site))
}
