---
id: TASK-45
title: Create the first Home card artwork concept
status: Done
assignee:
  - '@codex'
created_date: '2026-10-14 09:51'
updated_date: '2026-10-14 09:53'
labels: []
dependencies: []
type: enhancement
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user activated design-workflow to begin creating Home cards. Establish a coherent first artwork concept within the existing Clay kiosk identity before replacing working tiles. The device currently has one Probe test tile; Photos, Music, Weather and News are proposed sample built-ins, not changes to saved configuration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A saved four-card concept uses clear Photos, Music, Weather and News labels with a consistent Clay treatment
- [x] #2 The exact generation brief, provider and concept-only status are recorded with the artifact
- [x] #3 The first concept is reviewed for legibility, recognizable objects and consistency with the incumbent Home constraints
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect existing Home cards, fixed layouts, theme tokens and Clay references. 2. Apply focused UI UX Pro Max recognition and focus guidance within the incumbent identity. 3. Generate one four-card concept using the built-in subscription image tool; save artwork and exact prompt in the workspace. 4. Inspect the result and report concept status; do not alter saved device tiles or claim a working UI has been shipped.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Generated one concept sheet through the built-in ChatGPT image tool. Copied it into design/home-cards/home-cards-clay-v1.png and inspected that saved file. PNG dimensions verified from its header: 1983 by 793. All four labels are correct; objects are distinct, consistent Clay treatment and proposed permanent-color palette. The radio has finer detail than the other objects and should be simplified for a small implementation asset. Exact prompt, provider, dimensions, review and concept-only limitations are saved in the adjacent JSON manifest. No source UI or saved device configuration changed; build/unit/E2E checks do not apply to this raster concept deliverable.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Saved and visually inspected the first Photos, Music, Weather and News Clay card concept at design/home-cards/home-cards-clay-v1.png, with exact prompt and provenance in the adjacent JSON file. Verified all labels, coherent colors/objects and 1983x793 dimensions. This completes the first artwork concept, not working Home-card implementation.
<!-- SECTION:FINAL_SUMMARY:END -->
