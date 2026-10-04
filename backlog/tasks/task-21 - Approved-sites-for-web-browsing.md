---
id: TASK-21
title: Approved sites for web browsing
status: In Progress
assignee: []
created_date: '2026-09-29 05:54'
updated_date: '2026-10-04 14:18'
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
- [ ] #1 Each web tile's own site is approved automatically, including its subdomains
- [ ] #2 The caregiver can approve or remove more sites in admin
- [ ] #3 Going to a site that is not approved shows the friendly recovery screen with Back and Home, never the page
- [ ] #4 Stories opened from a News tile stay allowed, since main only opens stories it served
- [ ] #5 Blocked attempts are listed in admin with their domain and an "Approve this site" button
- [ ] #6 Only the pages she goes to are restricted; images and scripts a page loads from other domains still work
- [ ] #7 Tests cover subdomain matching and blocking, and an e2e test follows an unapproved link to the recovery screen
- [ ] #8 The News exception covers only the story page main served; links and redirects from that page follow the normal approved-sites rules
- [ ] #9 Blocked-page logging never records addresses from private News navigation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/browser/approvedSites.ts: hostFromUrl, matchesApprovedSite (exact host or a subdomain of it, case-insensitive, no suffix trickery like notexample.com), isApprovedHost, and alwaysAllow (loopback and private ranges, so a caregiver's own local site and the e2e fixtures keep working). Unit tested, matching urlPolicy.ts/loadFailure.ts.
2. Schema v8 adds browser.approvedSites with migration 008 (empty by default), following the 003-007 convention.
3. embeddedBrowser: will-navigate now rejects an unapproved host as well as a non-http(s) URL, shows the existing blocked recovery screen, and records the attempt. Main-frame only, so images and scripts from other domains still load (AC 6). Loopback stays allowed.
4. AC 1 needs no config: a tile's own site is approved by deriving hosts from the saved web tiles at check time.
5. News exception: openUrl's privateNavigation flag allows the one story host main just served, consumed by that first navigation. Links and redirects from the story page go through the normal rules, and the log still omits the address (AC 4, 8, 9).
6. New IPC: browser:blockedAttempts (recent, in-memory) and browser:approveSite (adds the host, clears the record). Admin gets a Browsing tab listing approved sites and blocked attempts with an 'Approve this site' button.
7. E2E: follow a link to an unapproved domain and see the recovery screen; approve it in admin and follow it again.
<!-- SECTION:PLAN:END -->
