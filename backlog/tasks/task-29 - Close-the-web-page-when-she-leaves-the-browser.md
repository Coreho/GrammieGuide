---
id: TASK-29
title: Close the web page when she leaves the browser
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
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
- [ ] #1 Leaving the browser by any path (Home button, idle timeout, recovery screen) closes the page, not just hides it
- [ ] #2 Audio or video playing on the page stops as soon as she leaves
- [ ] #3 Opening and closing web tiles many times in a row does not build up hidden page processes
- [ ] #4 An e2e test plays audio on a local fixture page, taps Home, and confirms playback stopped and the page was closed
<!-- AC:END -->
