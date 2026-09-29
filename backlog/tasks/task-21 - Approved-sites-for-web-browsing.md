---
id: TASK-21
title: Approved sites for web browsing
status: To Do
assignee: []
created_date: '2026-09-29 05:54'
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
<!-- AC:END -->
