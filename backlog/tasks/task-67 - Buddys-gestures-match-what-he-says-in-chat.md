---
id: TASK-67
title: Buddy's gestures match what he says in chat
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 05:04'
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
- [ ] #1 Each spoken chat reply starts with a gesture chosen from its wording (for example warmth, agreement, good news, thinking), falling back to the usual talking gestures
- [ ] #2 The choice is a pure, tested function; replies are never logged and the chat prompt is unchanged
- [ ] #3 Reduced motion keeps its single talk gesture per reply
- [ ] #4 Later gestures during the same reply continue from the usual talking pool
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add pure shared/buddy/replyGesture.ts: gestureForReply(text) picks wave/heart/cheer/agree/think/bow from whole-word cues, else null.
2. Machine: CHAT_PHASE carries an optional gesture; entering chat.talking forces it as the first clip (not in reduced motion); the first CLIP_DONE clears it so later gestures come from the talking pool.
3. CatModel: in chat.talking a finished forced clip reports CLIP_DONE instead of replaying it.
4. Chat panel passes gestureForReply(line) with the speaking phase; App and BuddyFloor carry it to the brain.
5. Unit tests for the classifier and machine transitions.
<!-- SECTION:PLAN:END -->
