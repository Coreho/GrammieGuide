---
id: TASK-64
title: Add in-app WhatsApp video calling
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26 13:50'
updated_date: '2026-10-26 14:14'
labels: []
dependencies: []
references:
  - docs/whatsapp-call-controls.md
type: feature
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner has verified voice calls, reboot persistence and automatic network recovery, and authorized video calls that stay within GrammieGuide with familiar large controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Saved contacts can start video and known incoming video callers can be answered or declined
- [ ] #2 Remote video and local preview stay inside GrammieGuide without exposing chats or provider windows
- [ ] #3 Camera and microphone require explicit start or answer and release on teardown or failure
- [x] #4 Voice regressions, built-app video tests and real-device verification are documented separately
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the retained public video renderer/start/answer contracts and prove a blank in-app canvas view with no provider UI. 2. Add explicit video capture leases and validated video start/answer while preserving voice and recovery. 3. Embed remote video and self preview inside the existing Family calls dialog with large trusted controls and teardown. 4. Verify unit boundaries and built-app fake-camera rendering, then build/lint and prepare the real-account test without placing a call.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented video start/answer, explicit camera leases and an embedded blank two-canvas surface. Retained public source contracts confirmed video flags, cross-window portal rendering and peerVideoJid callbacks. Fixed the initial isolated probe invalid-WebContents error by preserving Electron supplied webContents; regression covered. All 1297 unit tests pass; build/typechecks and lint pass. Six existing WhatsApp built-app tests passed; video built-app test passes after correcting its fractional-coordinate expectation to the deliberate ceil policy. Video test verifies fake camera, canvas pixels, native attachment/bounds, no new BrowserWindow, incoming/outgoing, camera-off mask and release. Real video remains pending an owner-initiated call.

Built app launched with the real existing linked profile. Read-only flags now report ready with both voice and video actions, one remote call peer, no active call and no pending command; no camera or call was started. REA file-page target evidence ev_8de3d8a13712dddf319520a51eb59442130abc2fcf1ad67072767ebb6a036a59 identifies the running launcher; ordinary CDP structural probes confirmed native renderer/source method readiness separately. Camera-permission mutation was caught by two tests, exact source restored, and 16 surface/session tests pass afterward. TASK-64 remains In Progress until real video is verified.

Final independent review found no material issues in the native view, capture leases, source binding, masks, bounds authority or teardown. Real video transport/device behavior remains the explicit owner verification step.
<!-- SECTION:NOTES:END -->
