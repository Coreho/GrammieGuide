---
id: TASK-71
title: New cat-like animations for Buddy
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
labels: []
milestone: m-9
dependencies: []
references:
  - scripts/blender/buildBuddy.sh
  - scripts/blender/fixCatRig.py
  - src/shared/buddy/commands.ts
priority: medium
type: feature
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
None of Buddy's 24 clips are cat-specific: he waves, cheers and dances like a person. Meshy's animation library has more gentle moves (yawning, sitting, nodding, blowing a kiss, clapping) that would suit him. The rig task his clips were made from (01a0dcaf-4f10-746b-86fa-75e22623504f) has expired on Meshy's side, so new clips need a re-rig of the same remeshed model first, checked against the existing skeleton so old and new clips match. The account had 1952 credits on 2026-10-27; earlier clips cost 3 credits each and the rig 5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At least five new gentle clips are baked into buddy.glb by buildBuddy.sh and listed in BUDDY_CLIPS, with clip names matching clips.ts
- [ ] #2 The re-rigged skeleton matches the old one closely enough that existing clips are unchanged, and the new rig task id is recorded in CLAUDE.md
- [ ] #3 The new clips are used: quiet ones in fidgets and night idles, friendly ones in tap reactions and gesture requests where they fit
- [ ] #4 Each new clip is checked on screen for feet staying on the floor, arms clear of the belly and a clean return to idle
- [ ] #5 Unit tests cover the clip list and pools; buildBuddy.sh documents the new clips
<!-- AC:END -->
