---
id: TASK-71
title: New cat-like animations for Buddy
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 06:08'
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
- [x] #1 At least five new gentle clips are baked into buddy.glb by buildBuddy.sh and listed in BUDDY_CLIPS, with clip names matching clips.ts
- [x] #2 The re-rigged skeleton matches the old one closely enough that existing clips are unchanged, and the new rig task id is recorded in CLAUDE.md
- [x] #3 The new clips are used: quiet ones in fidgets and night idles, friendly ones in tap reactions and gesture requests where they fit
- [x] #4 Each new clip is checked on screen for feet staying on the floor, arms clear of the belly and a clean return to idle
- [x] #5 Unit tests cover the clip list and pools; buildBuddy.sh documents the new clips
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-rig the remeshed model (done: rig task 01a17bbc-4c5f-70cc-bc5d-6280f0f69690, 1.35 m) and buy six clips on it: doze (38), hooray (417), big_stretch (412), funny_dance (23), groove (78), swing_dance (75), saved under CatModel/meshy/anims2/.
2. The new rig's rest pose differs from the old one (hips 11 cm lower, different bone orientations), so fixCatRig.py retargets clips from any other rig onto the old skeleton: per frame, each bone's world-space rotation change from its own rest is applied to the old rest, hips motion scaled by hip height, and the foot-height profile is taken from the source rig. Old clips are untouched.
3. buildBuddy.sh adds the six clips; BUDDY_CLIPS and the clip pools gain them (doze in night fidgets, dances in the music pool and gesture requests, hooray/big_stretch in tricks and taps, big_stretch as the morning stretch).
4. Render contact sheets of each new clip from the built GLB to check feet, belly and return to idle; then unit tests and docs (CLAUDE.md rig id).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Re-rigged CatModel/meshy/remesh/model.glb at 1.35 m: rig task 01a17bbc-4c5f-70cc-bc5d-6280f0f69690 (5 credits). Its skeleton does NOT match the old one (hips 11 cm lower, knees ~22 cm lower, different rest orientations), so instead of mixing clips, fixCatRig.py now retargets any clip from another rig: per frame each bone gets its source world-space rotation delta from rest, hips translation is scaled by hip height (1.24), and the source rig's foot heights become the re-ground profile. Bought 6 clips (18 credits): doze 38, hooray 417, big_stretch 412, funny_dance 23, groove 78, swing_dance 75. Dropped swing_dance after rendering: Meshy's own clip ends with his back to her, so the crossfade back to idle would spin him. The 24 existing clips are byte-identical in the new GLB (compared per animation). Rendered contact sheets of every new clip from the built GLB in Blender: feet on the floor, arms clear of the belly, hooray/big_stretch/funny_dance/groove end near the idle pose. doze is seated throughout; CatModel blends it in and out over 1.2 s instead of 0.35 s.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Five new clips (doze, hooray, big_stretch, funny_dance, groove) from a re-rig of the same mesh (rig 01a17bbc-..., recorded in CLAUDE.md). The new skeleton did not match, so fixCatRig.py now retargets foreign-rig clips through world-space rotation deltas; the 24 existing clips are byte-identical. Clips are used in fidgets, night, music, taps, petting, tricks and the morning stretch; doze blends over 1.2 s. Verified by Blender contact sheets and in-app screenshots of every clip, unit tests, and the handoff/gesture e2e. Cost 23 Meshy credits (swing_dance bought but dropped: it ends facing away).
<!-- SECTION:FINAL_SUMMARY:END -->
