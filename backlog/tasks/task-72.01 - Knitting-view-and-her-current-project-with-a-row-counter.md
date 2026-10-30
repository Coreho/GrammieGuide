---
id: TASK-72.01
title: Knitting view and her current project with a row counter
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 09:28'
updated_date: '2026-10-27 10:25'
labels:
  - knitting
  - home
dependencies: []
parent_task_id: TASK-72
priority: high
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The foundation for the knitting tile, and the part she would use most. Knitters lose their place when they put the work down, and with dementia that is harder to recover. A large row counter that remembers where she got to, next to what she is making and who it is for, lets her pick it straight back up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin has a Knitting tab where the caregiver sets her current project: what it is, who it is for, and an optional photo
- [x] #2 Home shows the project with a large row count and large add-one and take-one-away buttons
- [x] #3 The count survives an app restart and Home recovery, and saving it never resets her other settings
- [x] #4 An accidental quick double tap adds one row, not two
- [x] #5 The caregiver can reset the count or start a new project from admin; she cannot reset it by accident on Home
- [x] #6 Logs record that the counter was used, never the project name or who it is for
- [x] #7 Unit and e2e tests cover counting, persistence, the double-tap guard and the admin setup
- [x] #8 Delivers the Knitting tile and its shelf, modelled on the News shelf, with the My project sub-tile; the other sub-tiles arrive with their own subtasks
- [x] #9 The My project sub-tile shows the project name and current row, so she can see where she got to before opening it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/knitting: project types, caregiver input schema, pure row rule (min 0, max 9999, same-direction repeat within 1.5 s ignored).
2. main: KnittingStore (userData/knitting/project.json, temp file + rename, damaged file set aside and started empty, changes queued); knittingIpc with Home-only knitting:home/changeRows and caregiver-only knitting:get/saveProject/resetRows/removeProject; push knitting:changed to both windows; content-free activity events.
3. Contract + preloads; add 'knitting' to BUILTIN_TILE_KEYS and the admin Tiles labels.
4. Home: KnittingIcon, KnittingShelf modelled on NewsShelf with the My project card (photo or icon, name, row) and a counter view (Add a row, Take one away, Back to Knitting, Home); calm line when nothing is set up; own zLayer.
5. Admin: Knitting tab (what it is, who it is for, photo via TilePhotoPicker, save, save as new project, reset count, remove).
6. Idle dimming lets the counter buttons through (data-dim-pass-through), so a tap after a long row counts.
7. Tests: unit (rule, store, IPC gates), e2e knitting.spec.ts.
8. Docs: CLAUDE.md and README.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: her project and count live in userData/knitting/project.json, not config. Home writes the count on every tap and may not write config, and staying out of config avoids a schema bump that would clash with 021 on PR #56. Not part of settings backups. Found in review: optional idle dimming swallows the first tap after Home dims, and she taps the counter minutes apart, so a row could silently go uncounted; the counter buttons are now pass-through like music Stop (data-dim-pass-through). The new e2e test fails without that change (row stayed 1, expected 2) and passes with it.
Validation: typecheck and lint clean; 1,250 unit tests pass (25 new across knitting, knittingStore, knittingIpc); knitting.spec.ts 8/8 and idle-dimming.spec.ts 7/7; full e2e 172/172 on the build before the idle-dimming change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Knitting built-in tile: it opens a News-style shelf whose My project card shows her project and current row, and opens a large counter (Add a row, Take one away) with a 1.5 s same-direction double-tap guard. The caregiver sets what it is, who it is for and a photo in admin → Knitting and is the only one who can reset, start a new project or remove it. The project and count are stored in their own atomically written file in main, survive reloads and restarts, and are never logged by name. Counter taps also count through idle dimming. Verified with unit tests (rule, store, IPC gates), knitting.spec.ts (8 tests covering setup, shelf, counting, double tap, reload/restart, caregiver-only reset, fit at every text size, idle dimming, content-free logs) and a full e2e run.
<!-- SECTION:FINAL_SUMMARY:END -->
