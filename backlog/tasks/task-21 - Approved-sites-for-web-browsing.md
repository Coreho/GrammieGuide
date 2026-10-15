---
id: TASK-21
title: Approved sites for web browsing
status: Done
assignee:
  - '@codex'
  - '@claude'
created_date: '2026-09-29 05:54'
updated_date: '2026-10-15 07:00'
labels: []
milestone: m-10
dependencies:
  - TASK-01
  - TASK-16
priority: medium
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Protocol checks and popup blocking stop her escaping the kiosk, but they do not make an ordinary HTTPS page trustworthy: one link from a tile's site can lead anywhere. Limiting browsing to sites the caregiver approved removes most exposure to scam pages, more reliably than trying to detect them. Some sites legitimately hop across domains (sign-in pages, a news site's video host), so the caregiver needs an easy way to approve what was blocked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each web tile's own site is approved automatically, including its subdomains
- [x] #2 The caregiver can approve or remove more sites in admin
- [x] #3 Going to a site that is not approved shows the friendly recovery screen with Back and Home, never the page
- [x] #4 Stories opened from a News tile stay allowed, since main only opens stories it served
- [x] #5 Blocked attempts are listed in admin with their domain and an "Approve this site" button
- [x] #6 Only the pages she goes to are restricted; images and scripts a page loads from other domains still work
- [x] #7 Tests cover subdomain matching and blocking, and an e2e test follows an unapproved link to the recovery screen
- [x] #8 The News exception covers only the story page main served; links and redirects from that page follow the normal approved-sites rules
- [x] #9 Blocked-page logging never records addresses from private News navigation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure hostname/navigation policy, bounded approved-site config, schema 14 migration and focused unit coverage. 2. Enforce current saved-tile and caregiver approvals on main-document loads and redirects, preserve the narrowly scoped News story exception and private logs, and reuse PageRecovery. 3. Add a dedicated admin Sites tab and gated blocked-domain IPC, saving approvals through config:set. 4. Add local-server e2e coverage, update CLAUDE.md and README, then run typecheck, lint, all unit tests, build and only the four requested e2e specs. Leave task criteria/status and all git history unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema 14, current-tile hostname derivation, main-document guards (including redirects and programmatic opens/retry/back), and a dedicated Sites tab with gated domain history. Focused tests passed: 85 tests across approvedSites, browser integration and migrations. The dependency-free site rule removes only leading www; it refuses single-label suffixes, short second-level ccTLD entries and a short shared-host suffix denylist. It is not a complete Public Suffix List: uncommon multi-label/private suffixes are not enumerated, and legitimate short ccTLD domains can be conservatively refused. The News exception is separate from private logging and applies only to the exact main-served page; redirects and links require normal approval.

Validation: typecheck passed; lint passed after adding the blocked-history factory return type; all 1,040 unit tests passed (70 files); build passed with existing Zod annotation warnings. The requested four-spec Playwright run passed all 15 tests with one worker. New e2e coverage proves cross-domain images/scripts/redirected frames, blocked-link recovery and domain listing, live approval/removal, blocked fresh redirects, the served News page exception, private logs, and locked-admin rejection. CLAUDE.md and README updated. No criteria, status, final-summary or git-history changes made.

Claude's review changes: (1) the suffix guard refused any two-label site with a 2-letter country code and a name of 3 letters or fewer, so tiles on cbc.ca, nos.nl, web.de, orf.at or rte.ie could not open; replaced it with a hand-kept SHARED_SUFFIXES list and siteFor(), which keeps the exact host when dropping www would leave only a shared ending (www.gov.uk). (2) The schema now drops entries the rule rejects instead of failing the whole config (which would reset Home at boot); the Sites tab still rejects bad input. (3) 'Approve this site' now works for www.gov.uk-style hosts. (4) Removed the unused browser:blocked event and its preload listener. Checked Electron's docs: will-frame-navigate fires before will-navigate and preventDefault stops the rest, so a blocked link is logged once. Verified: typecheck, lint, npm test 1046 passed (photoLibrary's 5s timeout passed alone, a load flake), build, full e2e suite 142 passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Web pages can only go to approved sites: each web tile's own site (and the News fallback site) is approved automatically, the caregiver adds or removes more in admin's new Sites tab, and blocked links and redirects show the friendly recovery screen. Admin lists recently blocked domains with an Approve button; served News stories stay readable but their links follow the rules; logs keep domains only. Schema 14 adds approvedSites. Verified with unit tests, approved-sites.spec and the full e2e suite (142 passed).
<!-- SECTION:FINAL_SUMMARY:END -->
