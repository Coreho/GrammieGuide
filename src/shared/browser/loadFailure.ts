/**
 * Turns Chromium's load errors into the only distinction Home's recovery screen
 * needs. Where the old app left Chromium's own error page on her screen
 * ("ERR_NAME_NOT_RESOLVED"), no code or technical text reaches her now.
 */
export type PageLoadProblem = 'offline' | 'unreachable'

/** What the recovery screen is showing; 'blocked' comes from the navigation guard. */
export type PageProblem = PageLoadProblem | 'blocked'

/** Chromium net errors that mean this device has no working connection. */
const OFFLINE_ERRORS = new Set([
  -106, // ERR_INTERNET_DISCONNECTED
  -21, // ERR_NETWORK_CHANGED
  -137 // ERR_NAME_RESOLUTION_FAILED: no DNS at all, not one missing site
])

/** ERR_ABORTED: the load was replaced or cancelled on purpose (a new tap, Home), not a failure. */
const NOT_A_FAILURE = -3

export function classifyLoadFailure(
  errorCode: number,
  deviceOnline: boolean
): PageLoadProblem | null {
  if (errorCode >= 0 || errorCode === NOT_A_FAILURE) return null
  // Windows saying there's no connection explains any error, even "site not found".
  if (!deviceOnline || OFFLINE_ERRORS.has(errorCode)) return 'offline'
  return 'unreachable'
}

/**
 * The caregiver's log line: the site's domain and Chromium's error name. Never
 * the full address, which could say what she was reading.
 */
export function describeLoadFailure(url: string, errorDescription: string): string {
  let domain = 'unknown site'
  try {
    domain = new URL(url).hostname || domain
  } catch {
    // An unparseable address still gets logged, just without a domain.
  }
  return `${domain}: ${errorDescription.trim() || 'unknown error'}`
}
