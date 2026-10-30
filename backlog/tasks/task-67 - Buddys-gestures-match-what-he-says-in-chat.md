---
id: TASK-67
title: Buddy's gestures match what he says in chat
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 06:08'
labels: []
milestone: m-9
dependencies: []
references:
  - src/shared/buddy/buddyMachine.ts
  - src/renderer/launcher/src/buddy/CatModel.tsx
priority: medium
type: enhancement
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In chat every spoken reply starts with a generic talking gesture picked at random, so a warm or happy reply looks the same as a neutral one. The frozen chat prompt must not change, so the gesture has to be chosen from the reply text locally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each spoken chat reply starts with a gesture chosen from its wording (for example warmth, agreement, good news, thinking), falling back to the usual talking gestures
- [x] #2 The choice is a pure, tested function; replies are never logged and the chat prompt is unchanged
- [x] #3 Reduced motion keeps its single talk gesture per reply
- [x] #4 Later gestures during the same reply continue from the usual talking pool
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add pure shared/buddy/replyGesture.ts: gestureForReply(text) picks wave/heart/cheer/agree/think/bow from whole-word cues, else null.
2. Machine: CHAT_PHASE carries an optional gesture; entering chat.talking forces it as the first clip (not in reduced motion); the first CLIP_DONE clears it so later gestures come from the talking pool.
3. CatModel: in chat.talking a finished forced clip reports CLIP_DONE instead of replaying it.
4. Chat panel passes gestureForReply(line) with the speaking phase; App and BuddyFloor carry it to the brain.
5. Unit tests for the classifier and machine transitions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
gestureForReply() in shared/buddy/replyGesture.ts: whole-word cues for wave (greeting at the start), bow (thanks), cheer (good news), heart (warmth), agree (yes/of course at the start), think (let me think/hmm); sad words switch to a comfort-only list so sad news never gets a cheer. The panel sends it with the speaking phase; the machine stores it as openingClip (not forcedClip, so data-buddy-clip still means a deliberate gesture, which m4-buddy-presence relies on). CatModel reports CLIP_DONE after the opening clip, the machine clears it and the talking pool continues.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Spoken chat lines now open with a gesture read from their words (replyGesture.ts; sad words veto cheerful ones) through a new openingClip in chat.talking, then the usual talking pool continues; reduced motion keeps one talk. Verified by unit tests (classifier cases, machine transitions) and the Buddy e2e suites. The opening gesture itself has not been watched on the kiosk.
<!-- SECTION:FINAL_SUMMARY:END -->
