import { webHostname } from '@shared/browser/approvedSites'

export const MAX_BLOCKED_SITES = 50

/** Domain-only, session-only history: neither paths nor reading history survive here. */
export function createBlockedSites(): { record: (url: string) => string | null; list: () => string[] } {
  let domains: string[] = []
  return {
    record(url: string): string | null {
      const domain = webHostname(url)
      if (!domain) return null
      domains = [domain, ...domains.filter((saved) => saved !== domain)].slice(0, MAX_BLOCKED_SITES)
      return domain
    },
    list: (): string[] => [...domains]
  }
}

export const blockedSites = createBlockedSites()
