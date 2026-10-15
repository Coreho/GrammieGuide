import { useEffect, useState } from 'react'
import {
  MAX_APPROVED_SITES,
  MAX_SITE_LENGTH,
  siteFor,
  siteMatches,
  tileSites
} from '@shared/browser/approvedSites'
import { useConfigStore } from '../state/useConfigStore'

export function SitesTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [entry, setEntry] = useState('')
  const [blocked, setBlocked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const refresh = (): void => {
      window.admin.getBlockedSites().then(
        (sites) => {
          if (active) setBlocked(sites)
        },
        () => {
          if (active) setError('Could not read blocked sites. Unlock the panel and try again.')
        }
      )
    }
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  if (!config) return null
  const automatic = tileSites(config.tiles)
  const approved = [...automatic, ...config.approvedSites]
  const isApproved = (domain: string): boolean => approved.some((site) => siteMatches(domain, site))

  async function update(sites: string[]): Promise<void> {
    setSaving(true)
    setError('')
    try {
      await save({ approvedSites: sites })
      setEntry('')
    } catch {
      setError('Could not save sites. Check the hostname and unlock the panel if needed.')
    } finally {
      setSaving(false)
    }
  }

  function approve(raw: string): void {
    const site = siteFor(raw.trim().toLowerCase())
    if (!site) {
      setError(
        'Enter a hostname such as example.com, without an address, port or path. Broad suffixes such as co.uk are not allowed.'
      )
      return
    }
    if (config && !config.approvedSites.includes(site)) void update([...config.approvedSites, site])
  }

  return (
    <section style={{ maxWidth: 760 }}>
      <h2>Approved sites</h2>
      <p>
        She can visit these sites and their subdomains. Images, scripts and embedded frames can
        still load from other sites.
      </p>
      <h3>From saved tiles</h3>
      <p>
        These update automatically when you change a web tile or a News website. To remove one, edit
        or remove its tile.
      </p>
      {automatic.length ? (
        <ul>
          {automatic.map((site) => (
            <li key={site}>{site}</li>
          ))}
        </ul>
      ) : (
        <p>No saved websites yet.</p>
      )}
      <h3>Additional sites</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          approve(entry)
        }}
      >
        <label htmlFor="approved-site">Site hostname</label>{' '}
        <input
          id="approved-site"
          value={entry}
          maxLength={MAX_SITE_LENGTH}
          placeholder="example.com"
          onChange={(event) => setEntry(event.target.value)}
        />{' '}
        <button
          type="submit"
          disabled={saving || config.approvedSites.length >= MAX_APPROVED_SITES}
        >
          Add site
        </button>
      </form>
      <p>
        Up to {MAX_APPROVED_SITES} additional sites. Use a hostname only; IP addresses apply to that
        address only, on any port.
      </p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {config.approvedSites.map((site) => (
          <li key={site} style={{ marginBottom: 12 }}>
            {site}{' '}
            <button
              disabled={saving}
              aria-label={`Remove ${site}`}
              onClick={() => void update(config.approvedSites.filter((saved) => saved !== site))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <h3>Blocked attempts</h3>
      <p>
        The last 50 different domains blocked since the app started. Only the domain is kept here.
      </p>
      {!blocked.length && <p>No blocked sites this session.</p>}
      <ul>
        {blocked.map((domain) => (
          <li key={domain} style={{ marginBottom: 12 }}>
            {domain}{' '}
            {isApproved(domain) ? (
              <span>Approved</span>
            ) : (
              <button
                disabled={
                  saving || !siteFor(domain) || config.approvedSites.length >= MAX_APPROVED_SITES
                }
                onClick={() => approve(domain)}
              >
                Approve this site
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
