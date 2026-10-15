---
id: TASK-46
title: Implement the approved Clay Home card artwork
status: Done
assignee:
  - '@codex'
created_date: '2026-10-14 10:03'
updated_date: '2026-10-14 10:17'
labels: []
dependencies: []
type: enhancement
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user approved the first four-card Photos, Music, Weather and News Clay concept. Apply its recognizable sculpted objects to the existing Home cards while keeping live accessible labels and caregiver configuration authoritative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Built-in Photos, Music, Weather and News cards use cohesive offline Clay artwork with real accessible text labels
- [x] #2 Saved positions, colors, custom icons and caregiver photo overrides remain authoritative; missing images have usable fallbacks
- [x] #3 Both layouts fit every supported text size and maintain keyboard focus and reduced-motion behavior
- [x] #4 Artwork provenance, screenshots and relevant build and regression results are recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Produce a transparent four-object artwork atlas from the approved concept, with no raster labels or card backgrounds. 2. Use it only for default built-in illustrations; retain custom icons/photos and the dense layout fallback. 3. Adjust the bounded illustration footprint within the existing Tile component, preserving saved placement, theme tokens and real label fitting. 4. Verify the built app in an isolated profile across both layouts and font sizes, plus photo/icon override and activation regressions. 5. Run the manual design detector once, finish review and document the scoped extension.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved four-object transparent Clay atlas as a bundled offline image. Default Photos, Music, Weather and News illustrations use one quadrant; saved photo/icon choices retain precedence and the narrow dense layout remains label-only. Labels stay real DOM text, with measured fitting and larger 42px base on illustrated cards. Added inset keyboard focus and pointer-cancel recovery. E2E exposed an existing inline transition overriding reduced-motion CSS; moved that transition into scoped CSS and verified no animation under reduced motion. Verification: npm run build/typechecks pass; lint passes; 871 unit cases pass in this checkout; 4 new artwork E2Es pass across both layouts/all five text steps, all six themes, three logical viewport sizes, keyboard activation, overrides and image-error fallback; 8 existing color/photo E2Es pass. Manual detector ran once, empty findings. Seven resting screenshots visually inspected and finish reviewer returned ship at card scope with no material fixes. Documenter recorded the finished extension in design/home-cards/implementation.md. Exact prompt embedded in atlas and saved alongside the concept; alpha checked against light/dark/bold backgrounds. Real hardware remains unverified; saved device tiles were not replaced, and the preview is from isolated test settings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and reviewed the approved Clay card artwork for the four default built-ins, preserving saved configuration, photo/icon choices, layouts and live labels. Build, lint, 871 unit tests, four new card E2Es and eight photo/color regressions pass. Finish review: ship at card scope. Saved a working preview and provenance under design/home-cards; local branch only, real kiosk check outstanding.
<!-- SECTION:FINAL_SUMMARY:END -->
