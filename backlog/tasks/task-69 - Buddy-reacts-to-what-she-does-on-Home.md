---
id: TASK-69
title: Buddy reacts to what she does on Home
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
- [x] #1 Returning Home from a web page or a built-in view gets a small welcome gesture; closing her pictures gets a warm one
- [x] #2 While her music plays and Home is visible, his fidgets lean toward swaying and dancing
- [x] #3 His first greeting of the morning includes a stretch, and nights stay quiet as before
- [x] #4 Reactions never interrupt chat, a caregiver command or a walk, are rate limited so quick back-and-forth does not make him jumpy, and reduced motion limits them to the calm gestures
- [x] #5 The mapping from event to gesture is pure and unit tested, including night and reduced motion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared/buddy/homeReactions.ts: reactionFor(event, motion) maps builtinClosed to wave and photosClosed to heart (reduced keeps wave/heart); MORNING_CLIP for the daily stretch.
2. Machine: REACT { clip } plays a one-shot 'reacting' state only from resting/fidgeting, rate limited (20s) by context.lastReactionAt; a morningStretch flag (set on a morning start or when SETTINGS moves from night to day) makes the next idle decision a stretch, skipped in reduced motion.
3. Returning from a web page already remounts his floor and greets her, so only built-in views closing send REACT from App.
4. clips.ts: fidgets use a music pool (sway, dance) while music is playing, except at night; BuddyFloor passes musicPlaying.
5. Unit tests for the mapping, rate limit, morning flag, busy states and the music pool.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
homeReactions.ts maps builtinClosed -> wave and photosClosed -> heart (both in the calm set, so reduced motion needs no swap). The machine handles REACT only in resting/fidgeting, rate limited to one per 20 s via lastReactionAt, in a one-shot 'reacting' state. Returning from a web page already remounts HomeView and his floor, so the greeting is the welcome back; only built-in views closing send REACT (App watches openBuiltin). morningStretch is set on a morning start (6-12) or when SETTINGS moves from night to day; the next deciding step plays MORNING_CLIP (big_stretch after TASK-71), reduced motion clears it. pickClip takes music: fidgets use sway/groove/dance/funny_dance/idle_soft while music plays or is lowered, night still wins. Two existing machine tests that started at 10 AM now start at 3 PM so the stretch doesn't precede their fidget.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Buddy waves when a built-in view closes and sends a heart after her pictures (rate limited, idle only), stretches at the first idle moment of each morning, and sways/dances along while her music plays (night stays quiet). Coming back from a web page already greets her because his floor remounts. Verified by tests/unit/buddyHomeReactions.test.ts and the e2e check that closing Family Albums plays a heart. The music fidgets have only been unit tested, not watched live.
<!-- SECTION:FINAL_SUMMARY:END -->
