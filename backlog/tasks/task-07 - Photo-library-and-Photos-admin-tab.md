---
id: TASK-07
title: Photo library with captions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 04:19'
updated_date: '2026-10-12 08:17'
labels: []
milestone: m-8
dependencies:
  - TASK-05
  - TASK-06
documentation:
  - docs/specs/04-photo-games.md
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Family photos are something for her to enjoy: large pictures with a caption the caregiver wrote. There is no requirement for her to identify anyone or answer questions (the quiz-style photo games from spec 04 are on hold). Whether photos help her still needs to be tested with her. This library also supplies photo tile images and contact photos. Spec 04 still describes the import pipeline (downscaling, thumbnails, failed decodes). Recording narration was split out into TASK-36 after Codex's review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The admin Photos tab imports jpg, png and webp (and heic where Windows can decode it); each photo is downscaled to a 1600px long edge, saved as JPEG, and given a 320px thumbnail
- [ ] #2 Files that fail to decode are reported as failed without stopping the batch, and large imports show a progress count
- [ ] #3 Each photo has an optional caption, a "show to her" switch, and a caregiver-set order
- [ ] #4 The launcher can list only photos marked to show; listing all, editing and removing are admin-only
- [ ] #5 Tests cover import and the admin-only boundaries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the queued media store to atomically publish a JPEG and its managed thumbnail, preserving recovery and cleanup behavior. 2. Add a photo service with an injectable nativeImage-compatible codec, longer-edge resizing, per-file failures and progress counts, and validated caption/show-to-her/order metadata in the library index. 3. Add typed photo IPC and preload APIs: admin-only list-all/import/update/remove and launcher visible-only ordered listing; prevent generic photo mutation channels from bypassing the pipeline and keep errors path-free. 4. Add the Photos admin tab using existing admin conventions, with batch progress, captions, visibility, order and removal. 5. Add node-environment unit coverage for sizing, thumbnails, failure continuation/progress, persistence and IPC boundaries. Run typecheck, lint, all unit tests and build; append implementation notes without changing task status or acceptance checkboxes.

Native decoder verification found direct nativeImage decoding is PNG/JPEG-only. Add an injectable nativeImage adapter that falls back to its Windows Shell thumbnail decoder for WebP/HEIC, then bounds both JPEG outputs by their longer edge. Cover fallback success, failure, and platform guards in node tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed the existing implementation without restarting it. PhotosTab supports native-picker batch import, captions, show-to-her switches, numeric caregiver order, removal, and count-only progress/failure summaries. PhotoLibrary uses an injectable codec with nativeImage JPEG encoding and longer-edge bounds of 1600px/320px; the Windows adapter falls back to the Shell thumbnail decoder for WebP/HEIC. LibraryStore atomically publishes both JPEGs before metadata, rolls back failed saves, preserves thumbnails during corrupt-index recovery, and deletes both images on removal. All metadata stays in the library index. Photo admin channels requireAdminUnlocked first, generic photo mutations are rejected, the launcher has visible-only ordered listing, and responses use grammie-media URLs with path-free errors. No config schema, migrations, dependencies, protected files, or launcher photo UI changed.

Validation: npm run typecheck passed (exit 0); npm run lint passed with 0 errors/0 warnings (exit 0), after removing the unfinished temporary preview fixture; npm test passed 44 files and 725 tests (exit 0, 12.06s); npm run build passed (exit 0), with two Rollup annotation warnings in existing Zod dependency files. Node tests cover landscape/portrait/square and small images, thumbnails, supported extensions, empty/throwing decodes mid-batch, progress, metadata persistence/filter/order, write/index rollback, recovery, admin boundaries, picker-only sources, and path-free errors. An isolated browser fixture with mocked IPC verified caption/visibility/order saves, card reordering, disabled controls during import, and progress/failure summary rendering. A removal-dialog browser automation timeout prevented verifying removal through that fixture; main-process removal is unit-tested. Temporary fixture files were removed.

Handoff: tests/e2e/mediaProtocol.spec.ts was updated for the new photo bridge and thumbnail URLs, but no Playwright or Electron e2e run was performed as requested. Real Windows WebP/HEIC decoder behavior and full Electron UI integration remain for device/e2e verification. No commit, push, branch creation, task status changes, or acceptance checkbox changes in this continuation; the prior run had already left TASK-07 In Progress with @codex assigned.

Claude review (2026-10-12): read every changed line. One change: LibraryStore.addImage named its temp files .<id>.jpg.import.tmp / .<id>.thumb.jpg.import.tmp; it now uses the store's existing .<uuid>.import.tmp shape, because PR #35 narrows load()'s cleanup to exactly that shape and an interrupted photo import would otherwise leave temp files forever. The rollback unit test now fails the second image write by order instead of by name. Codex's first run (gpt-6.1-sol) stopped on a model-capacity error mid-task; a second session (gpt-6-astra) finished from the partial work. Note for the owner: new imports default to Show to her = on; older raw entries stay hidden until approved. Not verifiable here: real WebP and HEIC decoding through Windows' Shell thumbnail decoders (the e2e import uses a PNG through nativeImage).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-29 08:19
---
The spec 04 recipe `resize({ width: 1600 })` is wrong for portrait photos: a 3:4 portrait would stay about 2133px tall. Resize by whichever edge is longer, for the 320px thumbnail as well. (Greptile review of PR #5.)
---
<!-- COMMENTS:END -->
