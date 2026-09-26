import { connect } from 'net'

/**
 * Wi-Fi self-healing loop (M1 built the adapter discovery/restart pieces in
 * wifiHealer.ts; this is what actually runs them). Same shape as the old
 * app's setupSelfHealingWiFi (index.js:357-396): check every 10s, and once
 * the internet has been gone for a full minute, restart the Wi-Fi adapter.
 *
 * Two changes from the old loop: a restart is followed by a 5 minute
 * cooldown (the old one restarted the adapter every 10s for as long as the
 * router was down, which also kept dropping any link that was coming back),
 * and connectivity is a TCP connect to two public resolvers rather than
 * dns.resolve('8.8.8.8'), which "resolves" an IP address and so said little.
 */

export const CHECK_INTERVAL_MS = 10_000
export const OFFLINE_BEFORE_RESTART_MS = 60_000
export const RESTART_COOLDOWN_MS = 5 * 60_000

export type WifiWatchState = { online: boolean; offlineSince: number | null; lastRestartAt: number | null }

export const INITIAL_WIFI_STATE: WifiWatchState = { online: true, offlineSince: null, lastRestartAt: null }

export type WifiDecision = {
  state: WifiWatchState
  /** 'lost' / 'restored' on a change, for the caregiver's activity log. */
  transition: 'lost' | 'restored' | null
  restart: boolean
}

/** Pure: given the last state and what the probe just saw, what to do now. */
export function decideWifi(prev: WifiWatchState, online: boolean, now: number): WifiDecision {
  if (online) {
    return {
      state: { online: true, offlineSince: null, lastRestartAt: prev.lastRestartAt },
      transition: prev.online ? null : 'restored',
      restart: false
    }
  }
  const offlineSince = prev.offlineSince ?? now
  const longEnough = now - offlineSince >= OFFLINE_BEFORE_RESTART_MS
  const cooledDown = prev.lastRestartAt === null || now - prev.lastRestartAt >= RESTART_COOLDOWN_MS
  const restart = longEnough && cooledDown
  return {
    state: { online: false, offlineSince, lastRestartAt: restart ? now : prev.lastRestartAt },
    transition: prev.online ? 'lost' : null,
    restart
  }
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const done = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

/** Online if either public DNS resolver answers a TCP connect within 3s. */
export async function isOnline(): Promise<boolean> {
  const results = await Promise.all([canConnect('1.1.1.1', 443, 3000), canConnect('8.8.8.8', 53, 3000)])
  return results.some(Boolean)
}
