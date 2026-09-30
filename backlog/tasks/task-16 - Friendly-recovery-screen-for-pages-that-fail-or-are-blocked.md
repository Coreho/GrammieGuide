---
id: TASK-16
title: Friendly recovery screen for pages that fail or are blocked
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 05:53'
updated_date: '2026-09-30 22:38'
labels: []
milestone: m-10
dependencies: []
priority: medium
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a web page fails to load (no internet, the site is down, a certificate problem) she sees whatever Chromium shows, which is technical and confusing. She needs a calm screen that says what is happening in plain words and offers an obvious way back. Blocked navigations (see the approved-sites task) use the same screen. The way Home should look and sit the same on every page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a page fails to load she sees a calm screen in plain words with large Try again and Home buttons, never an error code or technical text
- [x] #2 When the device is offline the screen says so plainly and tries again by itself when the connection returns
- [ ] #3 The Home button is in the same place on every web page, the recovery screen and reader view
- [x] #4 The failure is logged with the domain and error type for the caregiver
- [x] #5 An e2e test loads an unreachable local address and sees the recovery screen
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure `shared/browser/loadFailure.ts`: turn Chromium's main-frame load error into 'offline' (no connection: ERR_INTERNET_DISCONNECTED and similar, or Windows reports offline) or 'unreachable' (anything else), ignoring ERR_ABORTED; and a log line of domain plus error name, never the full address.
2. embeddedBrowser: on a main-frame did-fail-load, hide the web page (the native view would cover Home's screen), tell Home the kind of problem, and log it once per failure. A retry reloads the failed address and shows the page again only when it loads. While offline, retry every 5 s whenever Windows reports a connection, without counting as her activity, so the idle timeout still applies. Blocked navigations use the same screen and hide the page until she chooses "Back to the page".
3. Home: a calm PageRecovery screen below the nav bar, with plain words and large "Try again"/"Back to the page" and "Home" buttons, and never an error code. The nav bar's Home button stays where it always is.
4. E2E: an unreachable local address shows the screen, logs the domain and error, and Try again opens the page once the server is up; offline emulation shows the offline wording and opens the page by itself once back online; a blocked link shows the blocked wording, and Back to the page returns to it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Claude (2026-09-30). Pure shared/browser/loadFailure.ts (6 unit tests); embeddedBrowser hides the native view and sends browser:page-problem on a main-frame did-fail-load (ERR_ABORTED ignored) or a blocked link; PageRecovery on Home with plain words and big Try again / Back to the page and Home buttons; offline retries every 5 s once Windows reports a connection, not counted as her activity; activity log gets "domain: ERR_NAME". Chromium offline emulation stalls loads instead of failing them, so e2e stands in for Windows online state via __e2e__.setDeviceOnline. E2E page-recovery.spec: unreachable (screen, no error text, page hidden, log "127.0.0.1: ERR_CONNECTION_REFUSED"), Try again once reachable with the nav Home button in the same place, offline wording then automatic reopen, blocked link then Back to the page. Verified: typecheck, lint, unit 274, build, full e2e 31 passed. AC 3 left open: true for web pages and the recovery screen (same nav bar), but reader view does not exist yet (TASK-04 should reuse the nav bar).
<!-- SECTION:NOTES:END -->
