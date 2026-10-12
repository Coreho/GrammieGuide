---
id: TASK-01
title: Harden the embedded browser session
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 04:18'
updated_date: '2026-10-05 04:49'
labels:
  - autopilot
  - needs-human
milestone: m-10
dependencies: []
documentation:
  - docs/specs/01-scam-shield.md
priority: medium
ordinal: 20
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Web tiles open real websites inside the kiosk, and she browses alone. Today the `WebContentsView` in `services/browser/embeddedBrowser.ts` shares the default session with the launcher and admin windows and has no permission, download or dialog handling, so a page can loop `alert()`s, hold her with a "leave this page?" prompt, ask for the camera or notifications, or push a download.

This is the always-on baseline of protected browsing (from the Hardening part of spec 01; not configurable). Its own session also lets the ad blocker and approved-sites rules attach to the browser without touching the launcher and admin windows. Moving to a new session logs her out of websites once; that is expected and worth telling the caregiver.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Embedded pages run in their own persistent session, separate from the launcher and admin windows; web tiles still load, and site logins survive app restarts
- [x] #2 Every permission request from an embedded page (notifications, camera, microphone, location, clipboard and the rest) is denied
- [x] #3 Downloads started by a page are cancelled and logged as `browser-download-blocked`
- [x] #4 Page dialogs (`alert`, `confirm`, `prompt`) and "leave this page?" prompts cannot block or hold the page
- [x] #5 Tests cover permission denial and download blocking against a local fixture page
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Autopilot run 20260930-2212 (2026-10-01): blocked at planning, not implemented. The plan reached 55% confidence (95% needed), so no branch or PR holds code for this task. Reviewers found the plan sound but too big for one PR (about 700-800 lines). Its parts: a persist:web session, deny-all permissions including openExternal, cancelled downloads, disableDialogs and will-prevent-unload, plus a relaunch e2e. It would also have replaced the five owner-written acceptance criteria with seven while unattended. It is certain to conflict with open PR #14 in openUrl, and its dialog test is timing-sensitive when the window is occluded. To unblock: approve splitting it into (a) session, permissions, external protocols, downloads and the loadURL catch, and (b) dialogs and leave-page prompts; approve the acceptance-criteria rewrite; merge PR #14 first and build on top of it.

Verified on main at a571302 (2026-10-05). Added one e2e test to web-session.spec.ts (persistence-across-restart) so AC1's 'site logins survive app restarts' is proven by a real relaunch against the same --user-data-dir, not inferred from the partition name: the fixture stores a value in localStorage, the app is closed and relaunched, the saved web tile is reopened and the value is still there. web-session.spec.ts now 4 tests, all passing through the e2e lock wrapper; ad-blocker.spec.ts (6), browser-close.spec.ts and the rest of the suite pass. Unit tests 680, lint and typecheck clean. AC4's leave-page half is proven behaviorally by browser-close.spec.ts, whose fixture always calls preventDefault in beforeunload and which asserts Home closes the page over six open/close cycles. The alert/confirm/prompt half is not e2e-testable at all: Chromium still raises Page.javascriptDialogOpening for a dialog Electron refuses to show, Playwright then tries to dismiss one that does not exist and the worker dies. That decision (disableDialogs, shouldPreventUnload, deny-all permissions) lives as pure data in shared/browser/webHardening.ts and is pinned by 4 unit tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Web tiles now run in their own persistent session (persist:web) with deny-all permissions, cancelled-and-logged downloads, disabled page dialogs and no leave-page prompt, so the launcher and admin windows keep the default session untouched. Verified: 4 e2e tests in web-session.spec.ts (own session, every permission denied incl. getUserMedia, download blocked with nothing on disk, login surviving a real restart), 4 unit tests pinning the hardening decisions, 680 unit tests, lint and typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
