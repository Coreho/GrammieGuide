---
id: TASK-03
title: Block ads and trackers in the embedded browser
status: To Do
assignee: []
created_date: '2026-09-29 04:18'
updated_date: '2026-09-29 05:51'
labels: []
milestone: m-10
dependencies:
  - TASK-01
documentation:
  - docs/specs/05-news-tile-reader-mode.md
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ads are how scam pages and misleading "download" buttons reach otherwise normal sites, and ads, pop-ups and autoplay video make news sites confusing for her. `@ghostery/adblocker-electron` has been installed since early on but never wired up. Spec 05 describes the blocker: bundled prebuilt lists, so startup needs no network, applied only to the browser's own session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ads and trackers are blocked in the embedded browser session only; the launcher and admin windows are unaffected
- [ ] #2 Blocking works with no network at startup, and a failed background list update never affects browsing
- [ ] #3 If the blocker fails to start, that is logged and web tiles still open
- [ ] #4 A test confirms a request from a local fixture page to a known ad domain is blocked
<!-- AC:END -->
