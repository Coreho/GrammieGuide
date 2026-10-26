---
id: TASK-64
title: Add in-app WhatsApp video calling
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26 13:50'
updated_date: '2026-10-26 17:31'
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

Investigate the owner video-quality report: clarify remote-camera state, test repeated canvas resets and real frame dimensions/source binding without placing calls, fix demonstrated rendering defects, then verify with focused/built-app tests and an owner comparison with the cooler off.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented video start/answer, explicit camera leases and an embedded blank two-canvas surface. Retained public source contracts confirmed video flags, cross-window portal rendering and peerVideoJid callbacks. Fixed the initial isolated probe invalid-WebContents error by preserving Electron supplied webContents; regression covered. All 1297 unit tests pass; build/typechecks and lint pass. Six existing WhatsApp built-app tests passed; video built-app test passes after correcting its fractional-coordinate expectation to the deliberate ceil policy. Video test verifies fake camera, canvas pixels, native attachment/bounds, no new BrowserWindow, incoming/outgoing, camera-off mask and release. Real video remains pending an owner-initiated call.

Built app launched with the real existing linked profile. Read-only flags now report ready with both voice and video actions, one remote call peer, no active call and no pending command; no camera or call was started. REA file-page target evidence ev_8de3d8a13712dddf319520a51eb59442130abc2fcf1ad67072767ebb6a036a59 identifies the running launcher; ordinary CDP structural probes confirmed native renderer/source method readiness separately. Camera-permission mutation was caught by two tests, exact source restored, and 16 surface/session tests pass afterward. TASK-64 remains In Progress until real video is verified.

Final independent review found no material issues in the native view, capture leases, source binding, masks, bounds authority or teardown. Real video transport/device behavior remains the explicit owner verification step.

Owner reported dev would not start. Reproduced npm run dev building successfully then exiting cleanly while the built app still held the shared-profile single-instance lock. Closed the verified idle built instance and started npm run dev successfully; no code changes needed. Avoid leaving the built app open when switching to dev.

Owner completed a real incoming video call and reports it connected/worked, but video and video-call audio quality were mediocre; voice-only audio was reportedly unaffected. Screenshot VidCallTest.png shows connected state, a visible local preview and the remote canvas still Waiting for video. Whether the remote picture appeared later or the other camera was on is awaiting clarification. Cooler interference is an owner hypothesis, not an established cause.

Owner clarified the other camera was on while the initial large picture stayed blank. On the next real call the owner confirmed the large remote picture appeared, but requested it substantially larger. Read-only live probes confirmed matching remote frame identity, video decode/render started, no pause at that moment, incoming portrait frames720x1280 and local1280x720; DOM backing canvases remained300x150 while remote displayed1035x290 CSS at1.25 DPR. Newly loaded PUBLIC single-call UI sources show pre-registration canvas backing initialization and a global source visibility pause from the hidden provider page. Implemented visibility resume/pause for the actual Home view, initial and changed-size backing buffers, resize deduplication and a larger flex call view with persistent End controls. These fixes do not establish the exact cause of the first blank attempt. Owner reports slight delay/echo and confirms both devices tested in the same room; acoustic feedback is a strong hypothesis, with separate-room/headphone comparison pending.

Quality corrections validated: all1303unit tests and all7WhatsApp built-app tests pass; build/typechecks and lint pass. Built-app regression starts remote rendering paused, requires visible-source resume, verifies real-size canvas buffers and >400px-high native video bounds with End controls within viewport. Final independent review found no material issues and retains uncertainty about the first blank attempt. Enlarged/sizing-corrected dev build is prepared for the next owner call; post-fix real quality and separate-room audio comparison remain pending.
<!-- SECTION:NOTES:END -->
