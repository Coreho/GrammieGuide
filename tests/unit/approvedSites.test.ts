import { describe, expect, it } from 'vitest'
import {
  hostFromUrl,
  isAlwaysAllowedHost,
  isApprovedHost,
  matchesApprovedSite,
  rememberAttempt,
  tileHosts,
  MAX_BLOCKED_ATTEMPTS
} from '@shared/browser/approvedSites'

/**
 * Which sites she may reach (TASK-21). The subdomain rule is the security-relevant
 * part: an over-permissive matcher is the same as no matcher, so the tricky cases
 * are pinned here rather than left to a URL the e2e happens not to use.
 */
describe('hostFromUrl', () => {
  it('reads the host and lowercases it', () => {
    expect(hostFromUrl('https://Example.COM/news/story')).toBe('example.com')
    expect(hostFromUrl('http://www.bbc.co.uk:8080/x')).toBe('www.bbc.co.uk')
  })

  it('keeps a port out of the host', () => {
    expect(hostFromUrl('http://127.0.0.1:3000/')).toBe('127.0.0.1')
  })

  it('returns null for something that is not an address', () => {
    for (const bad of ['', 'not a url', 'javascript:alert(1)', 'mailto:a@b.test']) {
      expect(hostFromUrl(bad)).toBeNull()
    }
  })
})

describe('matchesApprovedSite', () => {
  it('matches the site itself', () => {
    expect(matchesApprovedSite('example.com', 'example.com')).toBe(true)
  })

  it('matches a subdomain, including www', () => {
    expect(matchesApprovedSite('www.example.com', 'example.com')).toBe(true)
    expect(matchesApprovedSite('news.example.com', 'example.com')).toBe(true)
    expect(matchesApprovedSite('a.b.example.com', 'example.com')).toBe(true)
  })

  it('does not match a lookalike domain that merely ends with the same letters', () => {
    // The whole point of the dot: without it, notexample.com passes example.com.
    expect(matchesApprovedSite('notexample.com', 'example.com')).toBe(false)
    expect(matchesApprovedSite('example.com.evil.test', 'example.com')).toBe(false)
    expect(matchesApprovedSite('myexample.com', 'example.com')).toBe(false)
  })

  it('ignores case and stray leading dots in the configured value', () => {
    expect(matchesApprovedSite('WWW.Example.com', '.example.com')).toBe(true)
  })

  it('never matches an empty configured site', () => {
    expect(matchesApprovedSite('example.com', '')).toBe(false)
    expect(matchesApprovedSite('example.com', '  .  ')).toBe(false)
  })
})

describe('isAlwaysAllowedHost', () => {
  it('allows loopback and private ranges, so a caregiver can host their own site', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.1.2.3',
      '192.168.1.10',
      '172.16.0.1',
      '172.31.255.254',
      '::1'
    ]) {
      expect(isAlwaysAllowedHost(host), host).toBe(true)
    }
  })

  it('does not leak into public space', () => {
    for (const host of ['172.15.0.1', '172.32.0.1', '11.0.0.1', 'example.com', '169.254.1.1']) {
      expect(isAlwaysAllowedHost(host), host).toBe(false)
    }
  })
})

describe('isApprovedHost', () => {
  it('allows an approved site and its subdomains', () => {
    expect(isApprovedHost('example.com', ['example.com'])).toBe(true)
    expect(isApprovedHost('video.example.com', ['example.com'])).toBe(true)
  })

  it('blocks anything not on the list', () => {
    expect(isApprovedHost('scam.test', ['example.com'])).toBe(false)
    expect(isApprovedHost('scam.test', [])).toBe(false)
  })

  it('allows a loopback host even with an empty list', () => {
    expect(isApprovedHost('127.0.0.1', [])).toBe(true)
  })
})

describe('tileHosts', () => {
  it('collects the host of every web tile, once each', () => {
    expect(
      tileHosts([
        { type: 'web', url: 'https://bbc.co.uk/news' },
        { type: 'web', url: 'https://www.bbc.co.uk/weather' },
        { type: 'app', appPath: undefined } as never,
        { type: 'web' },
        { type: 'web', url: 'not a url' }
      ])
    ).toEqual(['bbc.co.uk'])
  })

  it('ignores built-in tiles, which are not sites', () => {
    expect(tileHosts([{ type: 'builtin', url: 'https://example.com' }])).toEqual([])
  })
})

describe('rememberAttempt', () => {
  const attempt = { id: 'scam.test', host: 'scam.test', from: 'bbc.co.uk' }

  it('adds the newest attempt last', () => {
    const stored = rememberAttempt([], attempt, Date.parse('2026-10-04T10:00:00Z'))
    expect(stored).toHaveLength(1)
    expect(stored[0]!.host).toBe('scam.test')
    expect(stored[0]!.at).toBe('2026-10-04T10:00:00.000Z')
  })

  it('keeps one entry per host, so a retry loop cannot flood the list', () => {
    let stored = rememberAttempt([], attempt, 1)
    stored = rememberAttempt(stored, attempt, 2)
    stored = rememberAttempt(stored, attempt, 3)
    expect(stored).toHaveLength(1)
    expect(stored[0]!.at).toBe(new Date(3).toISOString())
  })

  it('moves a repeat to the newest position', () => {
    let stored = rememberAttempt([], { id: 'a.test', host: 'a.test', from: null }, 1)
    stored = rememberAttempt(stored, { id: 'b.test', host: 'b.test', from: null }, 2)
    stored = rememberAttempt(stored, { id: 'a.test', host: 'a.test', from: null }, 3)
    expect(stored.map((item) => item.host)).toEqual(['b.test', 'a.test'])
  })

  it('caps the list', () => {
    let stored: ReturnType<typeof rememberAttempt> = []
    for (let i = 0; i < MAX_BLOCKED_ATTEMPTS + 10; i++) {
      stored = rememberAttempt(stored, { id: `h${i}.test`, host: `h${i}.test`, from: null }, i)
    }
    expect(stored).toHaveLength(MAX_BLOCKED_ATTEMPTS)
    // The oldest went first.
    expect(stored[0]!.host).toBe('h10.test')
  })
})