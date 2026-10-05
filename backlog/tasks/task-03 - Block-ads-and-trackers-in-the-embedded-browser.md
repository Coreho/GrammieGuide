---
id: TASK-03
title: Block ads and trackers in the embedded browser
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 04:18'
updated_date: '2026-10-05 05:08'
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
- [x] #1 Ads and trackers are blocked in the embedded browser session only; the launcher and admin windows are unaffected
- [x] #2 Blocking works with no network at startup, and a failed background list update never affects browsing
- [x] #3 If the blocker fails to start, that is logged and web tiles still open
- [x] #4 A test confirms a request from a local fixture page to a known ad domain is blocked
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on main and in 5e30ac7 (2026-10-05). Two acceptance criteria had no test and now do. AC3 (a blocker that cannot start is logged and web tiles still open) is new tests/e2e/ad-blocker-offline.spec.ts: it makes the cached engine unreadable by putting a directory where adblocker-engine.bin should be and points the network at a dead port, so startAdBlocker's own catch runs - adblocker-unavailable is in the activity log, adblocker-enabled is not, the web tile opens and loads, and the ad request is not ERR_BLOCKED_BY_CLIENT. AC2's second half (a failed background list update never affects browsing) is a new test in ad-blocker.spec.ts: the 24-hour timer is now scheduleRefresh() calling the exported refreshAdBlockerLists(), which is on the e2e hook, so the test makes fetch fail for one cycle, asserts the reliability log records 'keeping current lists', and asserts the tracker is still blocked. Note for anyone repeating that test: a dead HTTP_PROXY does not make the refresh fail, because the blocker's fetch is the global one and Node's fetch ignores the proxy variables - the test stubs globalThis.fetch instead. AC1's 'launcher and admin windows are unaffected' was already covered by session identity plus a single cache file. Full run on main: lint, typecheck, 679 unit tests, build, and all 71 e2e tests through the shared lock wrapper.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ads and trackers are blocked in the embedded browser's own session, cached on disk so a machine's first run is the only one that needs the network, and unable to affect Home or admin. Added the two missing proofs: a blocker that cannot start logs adblocker-unavailable and leaves web tiles working (new ad-blocker-offline.spec.ts), and a failed list refresh is recorded while blocking carries on (new test in ad-blocker.spec.ts, with refreshAdBlockerLists() extracted and exposed for e2e). Verified: 679 unit tests, lint and typecheck clean, all 71 e2e tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
