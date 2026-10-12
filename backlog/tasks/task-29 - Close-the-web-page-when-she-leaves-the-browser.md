---
id: TASK-29
title: Close the web page when she leaves the browser
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 09:24'
updated_date: '2026-10-05 05:09'
labels: []
milestone: m-10
dependencies: []
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`closeEmbeddedBrowser()` in `services/browser/embeddedBrowser.ts` removes the `WebContentsView` from the window and drops the reference, but never closes its `webContents`. The page keeps running out of sight, so a video or stream could keep playing after she taps Home or the idle timeout closes the browser, and each open/close cycle may leave a hidden page process behind. Found by Codex's plan review and confirmed in the code on 2026-09-29; not yet reproduced in the running app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Leaving the browser by any path (Home button, idle timeout, recovery screen) closes the page, not just hides it
- [x] #2 Audio or video playing on the page stops as soon as she leaves
- [x] #3 Opening and closing web tiles many times in a row does not build up hidden page processes
- [x] #4 An e2e test plays audio on a local fixture page, taps Home, and confirms playback stopped and the page was closed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. closeEmbeddedBrowser() closes the view's webContents after removing it from the window (guarding against an already-destroyed view), so the page, its audio and its renderer process end instead of running hidden.
2. Confirm every way out of the browser (Home button, idle timeout, anything else that hides the view) goes through closeEmbeddedBrowser().
3. E2E test with a local fixture page that plays sound: open it from a web tile, tap Home, check the page stopped making sound and its webContents is gone; open and close several times and check hidden page processes do not build up.
Implementation delegated to Codex (new session, workspace-write in this worktree); Claude verifies with typecheck, lint, unit and e2e runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Codex (session 01a0f3a3-8029-7953-b180-0470cc35405e): closeEmbeddedBrowser() now removes the view and then closes its webContents with waitForBeforeUnload: false (so a site's beforeunload can't keep it alive), guarding against already-destroyed objects; it also resets privateNavigation, and the launcher window's 'closed' event runs it. New tests/e2e/browser-close.spec.ts: a local page plays a Web Audio tone, the test waits until Electron reports it audible, taps Home, and checks the page is gone, nothing is audible, and the webContents ids match the baseline; six open/close cycles. Codex's sandbox could not start processes, so Claude verified on 2026-09-30: lint clean, npm test passed, npm run build ok, the new spec passes, and the full e2e suite passes (23). With the fix removed, the same spec fails with the page still open and audible after Home (fixturePages 1, audiblePages 1), so the test reproduces the bug. Callers checked: the Home button (browser:goHome) and the idle timeout in index.ts both go through closeEmbeddedBrowser(), which is now the only place the view is removed. AC 1 left open: the Home path is tested, the idle timeout uses the same function but has no test, and the recovery screen does not exist yet (TASK-16). Not committed yet.

Greptile review of PR #10 ("idle exit remains untested"): the idle check in index.ts is now closeBrowserIfIdle(extraIdleMs), exposed on the e2e-only __e2e__ hook, and a new e2e test opens the tone page, confirms the check leaves it open while not idle, then runs it as if a day had passed and checks the page is gone and silent. Both browser-close tests pass. AC 1 still waits on the recovery screen (TASK-16), which does not exist yet.

AC1 closed on 2026-10-05: all three ways out are now covered by tests/e2e/browser-close.spec.ts against the built app on main. The Home button opens and closes a tone-playing page six times over, asserting each time that the page is gone, nothing is audible and the webContents ids match the baseline. The idle timeout runs the real check through the closeBrowserIfIdle(extraIdleMs) hook: not idle leaves the page open, then it closes the page and its sound. The recovery screen path is the third test (added in a8e3a5c): a web tile pointed at a dead address shows the recovery screen with a live page underneath, and its Home button ends that page rather than blanking it, with openPageCount back to 0. browser-close.spec.ts passes as part of the full 71-test e2e run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Leaving the embedded browser by any path now closes the page instead of hiding it: closeEmbeddedBrowser() removes the WebContentsView and closes its webContents with waitForBeforeUnload: false, and it is the only place the view is removed, so the Home button, the idle timeout and the recovery screen all share it. Verified with tests/e2e/browser-close.spec.ts: six open/close cycles leave no hidden pages and stop playback, the idle check closes the page and its sound, and the recovery screen's Home ends a live page underneath.
<!-- SECTION:FINAL_SUMMARY:END -->
