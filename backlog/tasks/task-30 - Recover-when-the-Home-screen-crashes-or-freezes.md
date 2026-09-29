---
id: TASK-30
title: Recover when the Home screen crashes or freezes
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
labels: []
dependencies: []
priority: high
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The watchdog heartbeat is written by the main process every 15 seconds, whether or not the Home screen works, and `windows/windowManager.ts` has no handling for a crashed or unresponsive renderer. If Home crashes or hangs, the app still looks alive to the watchdog, and she is left with a blank or frozen screen and no way out. Found by Codex's plan review and confirmed in the code on 2026-09-29.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If the Home screen crashes, it reloads by itself
- [ ] #2 If the Home screen stops responding for a set time, it is reloaded
- [ ] #3 A crash loop does not reload forever: after a few failed recoveries in a short time, the app restarts cleanly and the watchdog path takes over
- [ ] #4 Each recovery is logged as a reliability event for the caregiver
- [ ] #5 The recovery policy is pure logic with unit tests, and an e2e test crashes the Home renderer and sees it come back
<!-- AC:END -->
