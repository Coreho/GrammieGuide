---
id: TASK-47
title: Create matching Games and Websites Home card artwork
status: Done
assignee:
  - '@codex'
created_date: '2026-10-14 10:25'
updated_date: '2026-10-14 10:30'
labels: []
dependencies: []
type: enhancement
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user requested Games and Websites cards after approving the first Photos, Music, Weather and News Clay set. Extend the approved artwork family. What these new category cards open is being clarified; the current app has no built-in Games or Websites collection, so artwork must not be described as working navigation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A saved concept includes exactly Games and Websites cards in the approved Clay visual family with correct clear labels
- [x] #2 A transparent two-object asset atlas and exact prompts/provider provenance are saved for future live-text card integration
- [x] #3 The saved images are inspected for object recognition, consistency and transparency, and navigation readiness is reported accurately
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the approved four-card visual reference and incumbent theme/card constraints. 2. Generate a two-card companion concept with puzzle pieces and a browser/globe. 3. Produce its two-object transparent atlas without labels or surfaces; inspect and save provenance. 4. Record readiness and obtain the category navigation decision before implementing collection screens or changing saved Home tiles.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Saved Games and Websites companion concept in design/home-cards/games-websites-clay-v1.png (1983x793) and its two-object atlas in games-websites-objects-v1.png (887x1774). Both were generated through the built-in ChatGPT image tool using the approved Clay concept as a style reference. Visually inspected the saved files: exact correct labels, recognizable puzzle and browser/globe shapes, cohesive rounded matte materials. PNG alpha checked through System.Drawing: all four sampled atlas corners have alpha 0; dimensions give two equal square cells. Exact prompts and provider saved in games-websites-v1.json and embedded in PNG metadata. Provenance scan finds four design rasters and zero missing prompts after restoring missing prompt metadata to the original reference (no visible change). No runtime source or saved Home configuration changed. Asked whether the new cards should open selection menus, stay artwork-first, or point directly to destinations; answer remains pending, so navigation was not invented. Existing four/eight layouts also require a placement decision before six large illustrated cards can appear together. No build or behavior-test rerun is needed for these artwork-only files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created and inspected matching Games and Websites card artwork plus a transparent two-object atlas, with exact prompts and provenance saved under design/home-cards. Checked correct labels, coherent object style, dimensions and transparent corners. Artwork is ready; category navigation and Home placement remain pending user clarification.
<!-- SECTION:FINAL_SUMMARY:END -->
