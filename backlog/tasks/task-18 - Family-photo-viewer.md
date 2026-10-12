---
id: TASK-18
title: Family photo viewer
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-10-12 15:12'
labels: []
milestone: m-8
dependencies:
  - TASK-07
priority: medium
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Photos are introduced as something to enjoy: large pictures with the caregiver's captions and, where recorded, a family member's voice. She is never asked to identify anyone or answer anything. Whether this helps her still needs testing with her, so keep it simple and watch how she uses it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Photos built-in tile opens one large picture at a time with its caption in large text
- [x] #2 Large next and back buttons move between photos; nothing advances on a timer unless the caregiver turns on a gentle slideshow
- [x] #3 There are no questions, quizzes, scores or names she has to supply
- [x] #4 Everything works with no internet connection
- [x] #5 Home and Back always work, and with no photos yet the tile shows a gentle message, never an error
- [x] #6 The activity log records opening the viewer, never photo content or captions
- [x] #7 An e2e test opens the viewer with seeded photos and pages through them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build on TASK-07 and fixed Home layouts (schema 8); add schema 9 photos.slideshowEnabled, default false, and pure migration 009 that preserves existing choices. 2. Add an admin Photos-tab checkbox for a gentle 30-second slideshow. 3. Register a Photos built-in view using the existing clay theme and a single large image, plain caption, fixed Home/Back/Next controls, calm empty/unavailable states, focus/keyboard support and no quizzes. Slideshow is off unless caregiver enabled, can be paused, resets after manual paging, and cleans up when closed. 4. Add a typed photos:open channel returning only visible photos and logging only photos-viewer-opened, never photo IDs, captions or paths. 5. Prove migration/defaults/log privacy with unit tests and seed real photos in Electron E2E for manual navigation, offline behavior, empty/broken files, slideshow timing/pause/cleanup, and all text sizes. Run unit, lint, build, E2E and inspect screenshots before completion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner selected an optional gentle slideshow in this conversation; keep it off by default. Viewer extends the current clay launcher and tile registry. PRs must land in order: fixed Home layouts, photo library, photo viewer; the slideshow setting uses migration 009 so it cannot collide with Home migration 008.

Implemented a registry-backed Photos viewer and photos:open bridge with a content-free opening event. Viewer has large persistent Home/Back/Next controls, focus containment and restoration, offline local images, calm empty/read/image failure states, and a scrollable long-caption area. Optional caregiver setting uses schema 9 / migration 009 and defaults off. A 30-second timeout begins after each image loads, resets after manual navigation, supports Pause/Play and clears on close. Nine focused Electron tests pass, including two window sizes at all five font steps. Inspected default and large-text screenshots; no renderer errors. Eight new migration/default/validation cases and the IPC privacy case were first observed failing, then passed. A deliberate wrong-timer cancellation mutation was rejected by the timer cleanup E2E test (one pending timer remained after Home); source was restored afterward. The full suite is running. PR #36 received a valid single-instance review finding; the tested PR #35 fixes have been merged into its prerequisite photo-library branch and will be brought into this branch before final verification.

Final verification: incorporated the prerequisite photo branch with PR #35 single-instance and cache/reliability fixes. All 745 unit tests, lint, typecheck and production build pass. The complete Electron suite passed 94/94, including the independently captured recovery error, real photo workflows and single-instance enforcement. Final integration review found that the caregiver selector still labelled the new photos key as Weather. A real add-tile E2E test first failed on that label; the editor now names Photos correctly, updates stock labels, preserves caregiver wording and uses the registered line icon. After this last UI-only fix, build/typecheck/lint pass and the 13 focused viewer/News E2E tests pass (10 viewer cases and 3 News cases). The large-text screenshots were inspected at 1264x760 and 1440x900; picture and navigation stay visible while long captions scroll separately. Merge order: #35, #34, #36, then this viewer PR. Migration 009 is reserved for the slideshow; later approved-sites work must use the next available schema version.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-29 09:25
---
Narration playback moved to TASK-36 (Codex review, 2026-09-29).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an offline Photos built-in view with one large picture, saved captions, large Home/Back/Next controls, keyboard focus handling and calm empty/error states. The caregiver can enable a 30-second slideshow (off by default), and she can pause it; paging resets the wait and closing clears the timer. Opening logs no photo content. Schema 9 migration preserves settings. Verified 745 unit tests, lint/typecheck/build, full E2E 94/94, and final viewer/News regression checks 13/13 after the selector integration fix. Real caregiver tile creation and all text sizes are covered.
<!-- SECTION:FINAL_SUMMARY:END -->
