---
id: TASK-70
title: Buddy turns his head toward what she taps
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 06:08'
labels: []
milestone: m-9
dependencies: []
references:
  - src/renderer/launcher/src/buddy/CatModel.tsx
priority: low
type: enhancement
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy looks straight ahead whatever she does. Turning his head briefly toward the tile or spot she taps makes him seem attentive, and needs no new animation clips because his rig has a head bone that can be turned in code on top of any clip.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When she taps somewhere on Home, his head turns smoothly toward that side within natural limits and eases back after a couple of seconds
- [x] #2 The turn layers on top of whatever clip is playing without breaking walking, gestures or chat
- [x] #3 Reduced motion makes the turn smaller and slower or skips it; taps on Buddy himself do not count
- [x] #4 The angle calculation is pure and unit tested
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/buddy/headLook.ts: lookYaw(dx, depth, bodyYaw, motion) clamps the head's turn relative to his body (smaller in reduced motion); lookWeight(elapsedMs, motion) eases in, holds about 2s and eases out (slower in reduced motion).
2. App: on a Home pointerdown that isn't on Buddy (after the existing exclusions), record the tap's Stage x and time; pass it down as lookAt.
3. FloorScene converts Stage pixels to world x; CatModel finds the Head bone and, after the mixer has posed him each frame, premultiplies a rotation about world up in the head's parent space, so it layers on any clip.
4. Unit tests for the angle and the easing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied after the drei mixer update each frame: premultiply a world-up rotation in the Head's parent space; if the mixer didn't write the bone that frame the clip's rotation is restored first, so turns never stack. Max 0.6 rad relative to body yaw (0.3 reduced), ease in 300 ms, hold 2 s, ease out 800 ms (700/1200 reduced). Visual check: test-results/buddy-glance-before.png vs buddy-glance-left.png after a tap at the far left - his face turns left.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A tap on Home makes Buddy glance toward it: a world-up turn added to his Head bone after the mixer each frame, clamped relative to his body and eased in/out (smaller and slower in reduced motion); taps on Buddy are excluded. Verified by tests/unit/buddyHeadLook.test.ts, before/after screenshots in the gestures e2e, and the Buddy e2e suites still passing.
<!-- SECTION:FINAL_SUMMARY:END -->
