/**
 * Which sites she is allowed to reach.
 *
 * Protocol checks and popup blocking stop her escaping the kiosk, but they do not
 * make an ordinary HTTPS page trustworthy: one link from a tile's site can lead
 * anywhere. Limiting her to sites the caregiver approved removes most of the
 * exposure to scam pages more reliably than trying to detect them, which is the
 * whole premise of this kiosk.
 *
 * Pure and Electron-free, like urlPolicy.ts, so it unit tests directly. Only
 * *main-frame navigations* are ever checked (see embeddedBrowser.ts) - the images,
 * scripts and fonts a page pulls from other domains must keep working, or approved
 * sites would break the moment a site used a CDN.
 */

/** How many blocked attempts to remember, newest last. */
export const MAX_BLOCKED_ATTEMPTS = 50

/**
 * Always allowed regardless of the approved list: loopback and the private ranges
 * a caregiver's own site would live on. Without this, a locally hosted page would
 * need approving like any other, and there is nothing for her to be scammed into
 * by reaching her own machine.
 */
const ALWAYS_ALLOWED = [
  /^127(?:\.\d{1,3}){3}$/,
  /^localhost$/,
  /^0\.0\.0\.0$/,
  /^10(?:\.\d{1,3}){3}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/,
  /^\[?::1\]?$/,
  /^f[cd][0-9a-f]{2}:/i
]

/** The host an address belongs to, or null if there isn't one. */
export function hostFromUrl(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    return host.length > 0 ? host : null
  } catch {
    return null
  }
}

/**
 * Whether `host` is `site` or one of its subdomains.
 *
 * The dot matters: `notexample.com` must not match an approved `example.com`.
 * A leading `www.` needs no special case, since it is just a subdomain.
 */
export function matchesApprovedSite(host: string, site: string): boolean {
  const target = host.toLowerCase()
  const approved = site.trim().toLowerCase().replace(/^\.+/, '')
  if (approved.length === 0) return false
  return target === approved || target.endsWith(`.${approved}`)
}

export function isAlwaysAllowedHost(host: string): boolean {
  return ALWAYS_ALLOWED.some((pattern) => pattern.test(host))
}

/**
 * Whether a main-frame navigation to `host` is permitted.
 *
 * `approvedSites` is only the caregiver's explicit additions: a web tile's own site
 * is allowed because the caller passes its host in too, so choosing a tile in admin
 * is itself the act of approving that site.
 */
export function isApprovedHost(host: string, approvedSites: readonly string[]): boolean {
  if (isAlwaysAllowedHost(host)) return true
  return approvedSites.some((site) => matchesApprovedSite(host, site))
}

/**
 * The hosts of every web tile the caregiver configured, for the allow-list.
 *
 * A host already covered by another is dropped: `www.bbc.co.uk` is a subdomain of
 * `bbc.co.uk`, so listing both would only make the admin list look like it has more
 * entries than it does.
 */
export function tileHosts(tiles: readonly { type: string; url?: string }[]): string[] {
  const hosts: string[] = []
  for (const tile of tiles) {
    if (tile.type !== 'web' || !tile.url) continue
    const host = hostFromUrl(tile.url)
    if (host && !hosts.includes(host)) hosts.push(host)
  }
  return hosts.filter(
    (host) => !hosts.some((other) => other !== host && matchesApprovedSite(host, other))
  )
}

export type BlockedAttempt = {
  /** Stable key for the admin list: host plus where it was reached from. */
  id: string
  host: string
  /** The tile whose site she was on, for context in admin. Never a full address. */
  from: string | null
  at: string
}

/**
 * A small ring of recent attempts, newest last, one entry per host. The caregiver
 * only needs "what did she try to reach", not a browsing history.
 */
export function rememberAttempt(
  attempts: readonly BlockedAttempt[],
  attempt: Omit<BlockedAttempt, 'at'>,
  now: number
): BlockedAttempt[] {
  const entry: BlockedAttempt = { ...attempt, at: new Date(now).toISOString() }
  const withoutHost = attempts.filter((item) => item.host !== attempt.host)
  return [...withoutHost, entry].slice(-MAX_BLOCKED_ATTEMPTS)
}