---
id: TASK-01
title: Harden the embedded browser session
status: To Do
assignee: []
created_date: '2026-09-29 04:18'
updated_date: '2026-09-29 05:51'
labels: []
milestone: m-10
dependencies: []
documentation:
  - docs/specs/01-scam-shield.md
priority: medium
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Web tiles open real websites inside the kiosk, and she browses alone. Today the `WebContentsView` in `services/browser/embeddedBrowser.ts` shares the default session with the launcher and admin windows and has no permission, download or dialog handling, so a page can loop `alert()`s, hold her with a "leave this page?" prompt, ask for the camera or notifications, or push a download.

This is the always-on baseline of protected browsing (from the Hardening part of spec 01; not configurable). Its own session also lets the ad blocker and approved-sites rules attach to the browser without touching the launcher and admin windows. Moving to a new session logs her out of websites once; that is expected and worth telling the caregiver.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Embedded pages run in their own persistent session, separate from the launcher and admin windows; web tiles still load, and site logins survive app restarts
- [ ] #2 Every permission request from an embedded page (notifications, camera, microphone, location, clipboard and the rest) is denied
- [ ] #3 Downloads started by a page are cancelled and logged as `browser-download-blocked`
- [ ] #4 Page dialogs (`alert`, `confirm`, `prompt`) and "leave this page?" prompts cannot block or hold the page
- [ ] #5 Tests cover permission denial and download blocking against a local fixture page
<!-- AC:END -->
