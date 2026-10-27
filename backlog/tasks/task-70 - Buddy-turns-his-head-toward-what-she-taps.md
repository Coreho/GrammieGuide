---
id: TASK-70
title: Buddy turns his head toward what she taps
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
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
- [ ] #1 When she taps somewhere on Home, his head turns smoothly toward that side within natural limits and eases back after a couple of seconds
- [ ] #2 The turn layers on top of whatever clip is playing without breaking walking, gestures or chat
- [ ] #3 Reduced motion makes the turn smaller and slower or skips it; taps on Buddy himself do not count
- [ ] #4 The angle calculation is pure and unit tested
<!-- AC:END -->
