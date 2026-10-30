---
id: TASK-66
title: More variety when she taps Buddy
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 06:08'
labels: []
milestone: m-9
dependencies: []
references:
  - src/shared/buddy/tapReactions.ts
priority: medium
type: enhancement
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tap on Buddy plays one of only 7 friendly reactions, although his model has 24 clips and several happy, calm ones (agree, fist_pump, motivate, stretch, look_around) are never used for taps. She taps him often, and the same few gestures repeat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tap reaction pool includes the unused friendly clips, each with a line that matches the gesture, asks nothing and claims nothing about her
- [x] #2 Reduced motion still limits taps to the calm wave and heart reactions
- [x] #3 Unit tests cover the new entries, the no-repeat rule and reduced motion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tap reactions for agree, fist_pump, motivate, stretch and look_around with matching, question-free lines.
2. Keep the reduced-motion filter (wave and heart only) and the no-repeat rule.
3. Extend the unit tests: every reaction clip is a known clip, lines ask nothing, reduced motion and repeats.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added agree, fist_pump, motivate, stretch and look_around reactions, then hooray and groove once TASK-71 baked them (14 reactions, all distinct clips). Reduced motion still filters to wave/heart. Unit: tests/unit/buddyTapReactions.test.ts (6 tests). e2e handoff taps test still passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tap reactions grew from 7 to 14, adding agree, fist_pump, motivate, stretch, look_around, hooray and groove with matching question-free lines; reduced motion still keeps wave/heart. Verified by tests/unit/buddyTapReactions.test.ts and the handoff e2e tap tests.
<!-- SECTION:FINAL_SUMMARY:END -->
