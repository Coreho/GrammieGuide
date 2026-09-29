---
id: TASK-10
title: Presence-aware Home
status: To Do
assignee: []
created_date: '2026-09-29 04:20'
labels: []
milestone: m-5
dependencies:
  - TASK-01
documentation:
  - docs/specs/02-presence-aware-home.md
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With the webcam, the kiosk can tell when she sits down: brighten and greet her by name. When she leaves, it closes any open web page and settles Home into a calm dimmed state, and the caregiver can see when she was last there. It uses motion only: no face recognition, and no frames stored or sent. It is opt-in because it turns on a camera in her home, and it is last in the build order because it needs the real device to verify.

Spec 02 has the details. Since it was written, `xstate` has come into use (Buddy's machine), and Buddy has a real greeting animation and speech bubble, so the greeting should use those. Buddy's night rule (9 PM-6 AM) and the spec's quiet hours (9 PM-7 AM) should be made consistent. The camera grant relies on the browser having its own session (task-01) so web pages never inherit it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Presence is off by default; the admin Presence tab explains what the camera is and is not used for, and offers camera choice, a live preview with a motion level, sensitivity, away time, greeting cooldown and quiet hours
- [ ] #2 She counts as present only after several motion frames in a row, and as away only after the configured still time
- [ ] #3 Arriving lifts the dim and Buddy greets her by first name with the weekday, at most once per cooldown and never in quiet hours
- [ ] #4 Leaving closes the embedded browser and dims Home with the clock still readable; any tap lifts the dim, so a failed camera can never trap her
- [ ] #5 Camera access is granted only to the launcher and admin windows, never to web pages
- [ ] #6 No image data crosses IPC, is logged, or is written to disk; only arrived, left, not-seen and camera events are logged
- [ ] #7 A camera failure shows "Camera not found" in admin and records a reliability event
- [ ] #8 Unit tests drive the detector and state machine with synthetic frames, and an e2e test drives presence through an __e2e__ hook
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Real-device check of the camera path with her webcam
<!-- DOD:END -->
