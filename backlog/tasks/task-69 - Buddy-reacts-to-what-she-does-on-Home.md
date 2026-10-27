---
id: TASK-69
title: Buddy reacts to what she does on Home
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 05:09'
labels: []
milestone: m-9
dependencies: []
references:
  - src/shared/buddy/buddyMachine.ts
  - src/renderer/launcher/src/App.tsx
priority: medium
type: feature
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy only notices her when she taps or chats with him. Small responses to her own actions (coming back from a website, closing her pictures, music playing) and to the time of day make him feel present without asking anything of her.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Returning Home from a web page or a built-in view gets a small welcome gesture; closing her pictures gets a warm one
- [ ] #2 While her music plays and Home is visible, his fidgets lean toward swaying and dancing
- [ ] #3 His first greeting of the morning includes a stretch, and nights stay quiet as before
- [ ] #4 Reactions never interrupt chat, a caregiver command or a walk, are rate limited so quick back-and-forth does not make him jumpy, and reduced motion limits them to the calm gestures
- [ ] #5 The mapping from event to gesture is pure and unit tested, including night and reduced motion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/buddy/homeReactions.ts: reactionFor(event, motion) maps builtinClosed to wave and photosClosed to heart (reduced keeps wave/heart); MORNING_CLIP for the daily stretch.
2. Machine: REACT { clip } plays a one-shot 'reacting' state only from resting/fidgeting, rate limited (20s) by context.lastReactionAt; a morningStretch flag (set on a morning start or when SETTINGS moves from night to day) makes the next idle decision a stretch, skipped in reduced motion.
3. Returning from a web page already remounts his floor and greets her, so only built-in views closing send REACT from App.
4. clips.ts: fidgets use a music pool (sway, dance) while music is playing, except at night; BuddyFloor passes musicPlaying.
5. Unit tests for the mapping, rate limit, morning flag, busy states and the music pool.
<!-- SECTION:PLAN:END -->
